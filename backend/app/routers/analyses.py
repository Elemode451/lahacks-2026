"""Saved analyses CRUD and sharing endpoints."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, HTTPException, Header

from app.models.schemas import (
    AnalysisDetail,
    AnalysisFingerprintsResponse,
    AnalysisSummary,
    ShareResponse,
)
from app.services.supabase_client import get_supabase_admin
from app.utils.auth import get_user_id, try_get_user_id

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analyses"])


@router.get("/me/analyses", response_model=list[AnalysisSummary])
async def list_my_analyses(authorization: str | None = Header(None)):
    """List the current user's saved analyses."""
    user_id = get_user_id(authorization)
    sb = get_supabase_admin()

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


@router.get("/analyses/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis(
    analysis_id: str,
    authorization: str | None = Header(None),
):
    """Get a specific analysis by ID.

    Public if the analysis has a share_slug. Otherwise requires auth
    and the requesting user must be the owner.
    """
    try:
        sb = get_supabase_admin()
    except Exception:
        raise HTTPException(503, "Service unavailable")

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
        user_id = try_get_user_id(authorization)
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
    user_id = get_user_id(authorization)
    sb = get_supabase_admin()

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
    try:
        sb = get_supabase_admin()
    except Exception:
        raise HTTPException(503, "Service unavailable")

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


# ── Fingerprint reconstruction ──────────────────────────────────────────────


@router.get(
    "/analyses/{analysis_id}/fingerprints",
    response_model=AnalysisFingerprintsResponse,
)
async def get_analysis_fingerprints(
    analysis_id: str,
    authorization: str | None = Header(None),
):
    """Reconstruct fingerprint data for a saved analysis from cached songs.

    Loads each song's fingerprints from the ``song_cache`` table (instant,
    no GPU required) and re-runs the aggregation to produce the same
    ``combined_fingerprint_b64`` and ``temporal_fingerprints_b64`` that
    were returned in the original analysis response.

    Access rules match ``GET /analyses/{analysis_id}`` — the analysis
    must be owned by the caller or have a share slug.
    """
    from app.services.song_cache import get_cached
    from app.services.tribe import (
        aggregate_fingerprints,
        describe_vibe,
        encode_fingerprint_b64,
        encode_temporal_b64,
        resample_sequence,
    )

    try:
        sb = get_supabase_admin()
    except Exception:
        raise HTTPException(503, "Service unavailable")

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

    # Enforce same access rules as get_analysis
    if not row.get("share_slug"):
        user_id = try_get_user_id(authorization)
        if user_id is None or user_id != row.get("owner_id"):
            raise HTTPException(403, "This analysis is private")

    payload = row.get("payload") or {}
    cache_keys = payload.get("song_cache_keys", [])
    songs_total = len(payload.get("songs", []))

    if not cache_keys:
        # Fallback: try to reconstruct cache keys from song spotify_ids
        for song in payload.get("songs", []):
            sid = song.get("spotify_id")
            if sid:
                cache_keys.append(f"spotify:{sid}")

    # Load fingerprints from cache
    fingerprints = []
    for key in cache_keys:
        if not key:
            continue
        fp = await asyncio.to_thread(get_cached, key)
        if fp is not None:
            fingerprints.append(fp)

    if not fingerprints:
        raise HTTPException(
            404,
            "Could not reconstruct fingerprints — song data may have been "
            "evicted from the cache. Re-analyze the songs to rebuild.",
        )

    combined = aggregate_fingerprints(fingerprints)
    combined_fp_b64 = encode_fingerprint_b64(combined.global_fingerprint)
    temporal_resampled = resample_sequence(combined.temporal_fingerprints)
    temporal_b64 = encode_temporal_b64(temporal_resampled)
    vibe = describe_vibe(combined.region_scores)

    return AnalysisFingerprintsResponse(
        analysis_id=analysis_id,
        combined_fingerprint_b64=combined_fp_b64,
        temporal_fingerprints_b64=temporal_b64,
        combined_region_scores=combined.region_scores,
        combined_timeline=combined.timeline_region_scores,
        peak_segment=combined.peak_index,
        vibe_description=vibe,
        songs_loaded=len(fingerprints),
        songs_total=songs_total,
    )
