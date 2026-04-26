"""Authentication endpoints using Supabase Auth."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from supabase import create_client

from app.config import settings
from app.models.schemas import (
    AuthResponse,
    LoginRequest,
    OAuthStartResponse,
    SignUpRequest,
    SpotifyRefreshRequest,
    SpotifyTokenData,
    SyncProfileResponse,
)
from app.rate_limit import limiter
from app.services.supabase_client import get_supabase_admin
from app.utils.auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _ephemeral_client():
    """Create a short-lived Supabase client for auth operations.

    This avoids mutating session state on the shared singleton,
    which would cause cross-user contamination in a concurrent server.
    """
    return create_client(settings.supabase_url, settings.supabase_key)


@router.post("/signup", response_model=AuthResponse)
@limiter.limit("5/minute")
async def signup(request: Request, req: SignUpRequest):
    """Create a new user account."""
    try:
        sb = _ephemeral_client()
        result = sb.auth.sign_up(
            {
                "email": req.email,
                "password": req.password,
                "options": {
                    "data": {"display_name": req.display_name},
                },
            }
        )
        user = result.user
        if user is None:
            raise HTTPException(400, "Signup failed")

        # Store display name in profiles table (admin client bypasses RLS)
        if req.display_name:
            get_supabase_admin().table("profiles").upsert(
                {"user_id": user.id, "display_name": req.display_name}
            ).execute()

        return AuthResponse(
            access_token=result.session.access_token if result.session else "",
            user_id=user.id,
            email=user.email or req.email,
            display_name=req.display_name,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Signup error")
        raise HTTPException(400, "Signup failed — please try again later")


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(request: Request, req: LoginRequest):
    """Log in with email and password."""
    try:
        sb = _ephemeral_client()
        result = sb.auth.sign_in_with_password(
            {"email": req.email, "password": req.password}
        )
        user = result.user
        if user is None:
            raise HTTPException(401, "Invalid credentials")

        # Fetch display name (admin client for reliable reads)
        profile = (
            get_supabase_admin()
            .table("profiles")
            .select("display_name")
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
        )
        display_name = profile.data.get("display_name", "") if profile.data else ""

        return AuthResponse(
            access_token=result.session.access_token if result.session else "",
            user_id=user.id,
            email=user.email or req.email,
            display_name=display_name,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Login error")
        raise HTTPException(401, "Login failed — please check your credentials")


@router.post("/sync-profile", response_model=SyncProfileResponse)
async def sync_profile(user_id: str = Depends(require_auth)):
    """Sync profile display name from OAuth provider metadata.

    Call this from the frontend after an OAuth login (Google, Spotify, etc.)
    to populate the profiles table with the user's provider display name.
    If a display_name already exists it is preserved.
    """
    sb = get_supabase_admin()

    # Check if a display name already exists
    existing = (
        sb.table("profiles")
        .select("display_name")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data and existing.data.get("display_name"):
        return SyncProfileResponse(display_name=existing.data["display_name"])

    # Pull name from provider metadata
    user = sb.auth.admin.get_user_by_id(user_id)
    display_name = ""
    if user and user.user:
        meta = user.user.user_metadata or {}
        display_name = (
            meta.get("full_name")
            or meta.get("name")
            or meta.get("display_name")
            or ""
        )

    if display_name:
        sb.table("profiles").upsert(
            {"user_id": user_id, "display_name": display_name}
        ).execute()

    return SyncProfileResponse(display_name=display_name)


# ── Spotify OAuth ───────────────────────────────────────────────────────────

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_ME_URL = "https://api.spotify.com/v1/me"
SPOTIFY_SCOPES = (
    "playlist-read-private playlist-read-collaborative "
    "user-read-email user-read-private"
)
_STATE_TTL_SECONDS = 600  # 10 minutes


def _spotify_basic_auth() -> str:
    """Return the Base64-encoded ``client_id:client_secret`` header value."""
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    return base64.b64encode(raw.encode()).decode()


def _sign_state(state: str) -> str:
    """Create an HMAC signature for the OAuth state value."""
    key = settings.spotify_client_secret.encode()
    ts = int(time.time())
    payload = f"{state}:{ts}".encode()
    sig = hmac.new(key, payload, hashlib.sha256).hexdigest()
    return f"{state}:{ts}:{sig}"


def _verify_state(signed: str) -> bool:
    """Verify a signed OAuth state value is valid and not expired."""
    parts = signed.split(":")
    if len(parts) != 3:
        return False
    state, ts_str, sig = parts
    try:
        ts = int(ts_str)
    except ValueError:
        return False
    if time.time() - ts > _STATE_TTL_SECONDS:
        return False
    key = settings.spotify_client_secret.encode()
    expected = hmac.new(key, f"{state}:{ts_str}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


@router.get("/spotify", response_model=OAuthStartResponse)
async def spotify_oauth_start() -> OAuthStartResponse:
    """Build the Spotify authorize URL and return it to the client."""
    state = secrets.token_urlsafe(32)
    signed_state = _sign_state(state)
    params = urlencode(
        {
            "client_id": settings.spotify_client_id,
            "response_type": "code",
            "redirect_uri": settings.spotify_redirect_uri,
            "scope": SPOTIFY_SCOPES,
            "state": signed_state,
        }
    )
    url = f"{SPOTIFY_AUTH_URL}?{params}"
    return OAuthStartResponse(url=url)


def _error_redirect(error_code: str) -> RedirectResponse:
    """Redirect to the frontend error page with the given error code."""
    return RedirectResponse(
        url=f"{settings.frontend_url}/auth/callback"
        f"?error={quote(error_code)}&provider=spotify"
    )


@router.get("/spotify/callback")
async def spotify_oauth_callback(
    state: str,
    code: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Handle the Spotify OAuth redirect: exchange code, upsert user, redirect."""
    if error or not code:
        return _error_redirect(error or "access_denied")
    if not _verify_state(state):
        return _error_redirect("invalid_state")
    try:
        # 1. Exchange authorization code for tokens
        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                SPOTIFY_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {_spotify_basic_auth()}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.spotify_redirect_uri,
                },
            )
        if token_resp.status_code != 200:
            logger.error("Spotify token exchange failed: %s", token_resp.text)
            return _error_redirect("token_exchange_failed")

        token_data = token_resp.json()
        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")

        # 2. Fetch Spotify user profile
        async with httpx.AsyncClient() as client:
            me_resp = await client.get(
                SPOTIFY_ME_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if me_resp.status_code != 200:
            logger.error("Spotify /me request failed: %s", me_resp.text)
            return _error_redirect("profile_fetch_failed")

        spotify_profile = me_resp.json()
        spotify_email = spotify_profile.get("email")
        spotify_user_id = spotify_profile.get("id", "")
        display_name = spotify_profile.get("display_name", "")

        if not spotify_email:
            return _error_redirect("no_email")

        # 3. Upsert user in Supabase
        sb = get_supabase_admin()
        supabase_session, user_id = await _upsert_spotify_user(
            sb, spotify_email, spotify_user_id, display_name
        )

        # 4. Store Spotify tokens
        expires_in = token_data.get("expires_in", 3600)
        expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        ).isoformat()
        sb.table("spotify_tokens").upsert(
            {
                "user_id": user_id,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_at": expires_at,
                "scope": token_data.get("scope", ""),
                "spotify_user_id": spotify_user_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

        # 5. Redirect to frontend with full Supabase session in hash fragment
        from urllib.parse import quote as url_quote
        redirect_url = (
            f"{settings.frontend_url}/auth/callback"
            f"#access_token={url_quote(supabase_session.access_token)}"
            f"&refresh_token={url_quote(supabase_session.refresh_token)}"
            f"&expires_in={supabase_session.expires_in}"
            f"&token_type=bearer"
            f"&provider=spotify"
        )
        return RedirectResponse(url=redirect_url)

    except Exception:
        logger.exception("Spotify OAuth callback error")
        return _error_redirect("auth_failed")


async def _upsert_spotify_user(
    sb, email: str, spotify_user_id: str, display_name: str
) -> tuple[str, str]:
    """Find or create a Supabase user for the given Spotify account.

    Returns ``(supabase_access_token, user_id)``.

    Strategy: try to create first; if the email already exists, catch the
    error and update instead.  This avoids querying ``auth.users`` via
    PostgREST (which lives in the ``auth`` schema, not ``public``).
    """
    user_id: str | None = None

    try:
        random_password = secrets.token_urlsafe(32)
        result = sb.auth.admin.create_user(
            {
                "email": email,
                "password": random_password,
                "email_confirm": True,
                "user_metadata": {
                    "display_name": display_name,
                    "spotify_user_id": spotify_user_id,
                    "provider": "spotify",
                },
            }
        )
        if result.user is None:
            raise HTTPException(500, "Failed to create user account")
        user_id = result.user.id
        is_new_user = True
    except HTTPException:
        raise
    except Exception as exc:
        exc_msg = str(exc).lower()
        if "already" not in exc_msg and "duplicate" not in exc_msg:
            logger.exception("Unexpected error creating Supabase user")
            raise HTTPException(500, "Failed to create user account")
        # User already exists — look up via admin API and update metadata
        logger.info("User %s already exists, linking Spotify account", email)
        existing = _find_user_by_email(sb, email)
        if existing is None:
            raise HTTPException(500, "Failed to locate existing user account")
        user_id = existing.id
        is_new_user = False
        sb.auth.admin.update_user_by_id(
            user_id,
            {
                "user_metadata": {
                    **(existing.user_metadata or {}),
                    "spotify_user_id": spotify_user_id,
                    "provider": "spotify",
                }
            },
        )

    # Store display name in profiles table (outside try so failures don't
    # trigger the "user already exists" fallback)
    if is_new_user and display_name:
        sb.table("profiles").upsert(
            {"user_id": user_id, "display_name": display_name}
        ).execute()

    # Generate a session via magic link OTP verification
    link_resp = sb.auth.admin.generate_link(
        {
            "type": "magiclink",
            "email": email,
        }
    )

    ephemeral = _ephemeral_client()
    if hasattr(link_resp, "properties") and hasattr(
        link_resp.properties, "hashed_token"
    ):
        verify_resp = ephemeral.auth.verify_otp(
            {
                "token_hash": link_resp.properties.hashed_token,
                "type": "magiclink",
            }
        )
        if verify_resp.session:
            return verify_resp.session, user_id

    raise HTTPException(500, "Failed to generate authentication session")


def _find_user_by_email(sb, email: str):
    """Find a Supabase auth user by email using paginated admin list.

    Iterates through all pages to handle large user bases.
    Returns the user object or ``None``.
    """
    page = 1
    per_page = 50
    while True:
        users = sb.auth.admin.list_users(page=page, per_page=per_page)
        if not users:
            break
        for u in users:
            if hasattr(u, "email") and u.email == email:
                return u
        if len(users) < per_page:
            break
        page += 1
    return None


@router.post("/spotify/refresh", response_model=SpotifyTokenData)
async def spotify_refresh_token(
    req: SpotifyRefreshRequest,
    _user_id: str = Depends(require_auth),
) -> SpotifyTokenData:
    """Exchange a Spotify refresh token for a new access token."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                SPOTIFY_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {_spotify_basic_auth()}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": req.refresh_token,
                },
            )
        if resp.status_code != 200:
            logger.error("Spotify token refresh failed: %s", resp.text)
            raise HTTPException(400, "Failed to refresh Spotify token")

        data = resp.json()
        new_access_token = data["access_token"]
        new_refresh_token = data.get("refresh_token", req.refresh_token)
        new_expires_in = data.get("expires_in", 3600)
        new_scope = data.get("scope", "")

        # Persist updated tokens so server-side code stays in sync
        new_expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=new_expires_in)
        ).isoformat()
        get_supabase_admin().table("spotify_tokens").upsert(
            {
                "user_id": _user_id,
                "access_token": new_access_token,
                "refresh_token": new_refresh_token,
                "expires_at": new_expires_at,
                "scope": new_scope,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

        return SpotifyTokenData(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=new_expires_in,
            scope=new_scope,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Spotify token refresh error")
        raise HTTPException(500, "Failed to refresh Spotify token")
