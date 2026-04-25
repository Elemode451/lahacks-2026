"""Saved analyses CRUD and sharing endpoints."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException, Header

from app.models.schemas import AnalysisDetail, AnalysisSummary, ShareResponse
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analyses"])


def _get_user_id(authorization: str | None) -> str:
    """Extract user ID from the Supabase JWT in the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ")
    try:
        sb = get_supabase()
        user = sb.auth.get_user(token)
        if user is None or user.user is None:
            raise HTTPException(401, "Invalid token")
        return user.user.id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid token")


@router.get("/me/analyses", response_model=list[AnalysisSummary])
async def list_my_analyses(authorization: str | None = Header(None)):
    """List the current user's saved analyses."""
    user_id = _get_user_id(authorization)
    sb = get_supabase()

    result = (
        sb.table("analyses")
        .select("id, kind, title, created_at, share_slug")
        .eq("owner_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    return [
        AnalysisSummary(
            analysis_id=row["id"],
            kind=row["kind"],
            title=row["title"],
            created_at=row.get("created_at"),
            share_slug=row.get("share_slug"),
        )
        for row in (result.data or [])
    ]


def _try_get_user_id(authorization: str | None) -> str | None:
    """Try to extract user ID from token. Returns None if not authenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        sb = get_supabase()
        user = sb.auth.get_user(token)
        if user is None or user.user is None:
            return None
        return user.user.id
    except Exception:
        return None


@router.get("/analyses/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis(
    analysis_id: str,
    authorization: str | None = Header(None),
):
    """Get a specific analysis by ID.

    Public if the analysis has a share_slug. Otherwise requires auth
    and the requesting user must be the owner.
    """
    sb = get_supabase()

    result = (
        sb.table("analyses")
        .select("*")
        .eq("id", analysis_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Analysis not found")

    row = result.data

    # If not shared, require auth and ownership
    if not row.get("share_slug"):
        user_id = _try_get_user_id(authorization)
        if user_id is None or user_id != row.get("owner_id"):
            raise HTTPException(403, "This analysis is private")

    return AnalysisDetail(
        analysis_id=row["id"],
        kind=row["kind"],
        title=row["title"],
        payload=row.get("payload", {}),
        created_at=row.get("created_at"),
        share_slug=row.get("share_slug"),
    )


@router.post("/analyses/{analysis_id}/share", response_model=ShareResponse)
async def share_analysis(
    analysis_id: str,
    authorization: str | None = Header(None),
):
    """Generate a public share link for an analysis."""
    user_id = _get_user_id(authorization)
    sb = get_supabase()

    # Verify ownership
    result = (
        sb.table("analyses")
        .select("id, owner_id, share_slug")
        .eq("id", analysis_id)
        .maybe_single()
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Analysis not found")
    if result.data["owner_id"] != user_id:
        raise HTTPException(403, "Not your analysis")

    # Generate slug if not already shared
    slug = result.data.get("share_slug")
    if not slug:
        slug = uuid.uuid4().hex[:10]
        sb.table("analyses").update({"share_slug": slug}).eq("id", analysis_id).execute()

    return ShareResponse(
        share_url=f"/share/{slug}",
        share_slug=slug,
    )


@router.get("/share/{slug}", response_model=AnalysisDetail)
async def get_shared_analysis(slug: str):
    """View a publicly shared analysis by its slug."""
    sb = get_supabase()

    result = (
        sb.table("analyses")
        .select("*")
        .eq("share_slug", slug)
        .maybe_single()
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Shared analysis not found")

    row = result.data
    return AnalysisDetail(
        analysis_id=row["id"],
        kind=row["kind"],
        title=row["title"],
        payload=row.get("payload", {}),
        created_at=row.get("created_at"),
        share_slug=row.get("share_slug"),
    )
