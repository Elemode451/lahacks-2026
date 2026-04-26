"""Shared authentication helpers.

Provides reusable utilities for extracting and validating Supabase JWTs
across all routers, plus a FastAPI dependency for endpoint protection.
"""

from __future__ import annotations

import logging

from fastapi import Header, HTTPException

from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)


def get_user_id(authorization: str | None) -> str:
    """Extract user ID from the Supabase JWT in the Authorization header.

    Uses the admin client's auth.get_user(token) which validates the JWT
    without mutating any session state on the client.

    Raises HTTPException(401) if the token is missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ")
    try:
        sb = get_supabase_admin()
        user = sb.auth.get_user(token)
        if user is None or user.user is None:
            raise HTTPException(401, "Invalid token")
        return user.user.id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")


def try_get_user_id(authorization: str | None) -> str | None:
    """Try to extract user ID from token. Returns None if not authenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        sb = get_supabase_admin()
        user = sb.auth.get_user(token)
        if user is None or user.user is None:
            return None
        return user.user.id
    except Exception:
        return None


async def require_auth(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency that returns user_id or raises 401.

    Usage::

        @router.get("/protected")
        async def my_endpoint(user_id: str = Depends(require_auth)):
            ...
    """
    return get_user_id(authorization)
