"""Authentication endpoints using Supabase Auth."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import AuthResponse, LoginRequest, SignUpRequest
from app.services.supabase_client import get_supabase, get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignUpRequest):
    """Create a new user account."""
    try:
        sb = get_supabase()
        result = sb.auth.sign_up(
            {"email": req.email, "password": req.password}
        )
        user = result.user
        if user is None:
            raise HTTPException(400, "Signup failed")

        # Store display name in profiles table (uses admin client to bypass RLS)
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
    except Exception as e:
        logger.exception("Signup error")
        raise HTTPException(400, str(e))


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    """Log in with email and password."""
    try:
        sb = get_supabase()
        result = sb.auth.sign_in_with_password(
            {"email": req.email, "password": req.password}
        )
        user = result.user
        if user is None:
            raise HTTPException(401, "Invalid credentials")

        # Fetch display name
        profile = (
            sb.table("profiles")
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
    except Exception as e:
        logger.exception("Login error")
        raise HTTPException(401, str(e))
