"""Authentication endpoints using Supabase Auth."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from supabase import create_client

from app.config import settings
from app.models.schemas import AuthResponse, LoginRequest, SignUpRequest, SyncProfileResponse
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
async def signup(req: SignUpRequest):
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
async def login(req: LoginRequest):
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
    if existing.data and existing.data.get("display_name"):
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
