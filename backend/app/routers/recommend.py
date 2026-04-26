"""Recommendation endpoints — split so the frontend controls blending.

Three sub-endpoints under /recommendations:
  POST /recommendations/similar        — brain-region cosine similarity
  POST /recommendations/collaborative  — "users like you also like"
  GET  /recommendations/history        — previously recommended songs
  DELETE /recommendations/history      — clear recommendation history
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Header

from app.models.schemas import (
    CollaborativeResponse,
    CompareRequest,
    CompareResponse,
    RecommendationHistoryResponse,
    SimilarRequest,
    SimilarResponse,
    SimilarityComponents,
    SongInfo,
    SongMatch,
)
from app.services.song_cache import (
    clear_recommendation_history,
    find_collaborative_recommendations,
    find_similar_songs,
    get_cached_lightweight,
    get_previously_recommended,
    get_recommendation_history,
    make_lookup_key,
    record_recommendations,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recommendations", tags=["recommendations"])


def _try_get_user_id(authorization: str | None) -> str | None:
    """Extract user ID from the Supabase JWT. Returns None if unauthenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        from app.services.supabase_client import get_supabase_admin
        sb = get_supabase_admin()
        user = sb.auth.get_user(token)
        if user is None or user.user is None:
            return None
        return user.user.id
    except Exception:
        return None


def _require_user_id(authorization: str | None) -> str:
    """Extract user ID or raise 401."""
    uid = _try_get_user_id(authorization)
    if uid is None:
        raise HTTPException(401, "Authentication required for this endpoint")
    return uid


# ── Brain similarity ────────────────────────────────────────────────────────


@router.post("/similar", response_model=SimilarResponse)
async def get_similar(
    req: SimilarRequest,
    authorization: str | None = Header(None),
):
    """Find songs with similar brain-response patterns (cosine similarity on
    the 6 brain-region activation values).

    Works without auth. If authenticated and `exclude_previously_recommended`
    is true, songs already recommended to this user are filtered out.
    """
    if not req.youtube_url and not req.spotify_id:
        raise HTTPException(400, "Provide either youtube_url or spotify_id")

    cache_key = make_lookup_key(
        youtube_url=req.youtube_url,
        spotify_id=req.spotify_id,
    )
    if not cache_key:
        raise HTTPException(400, "Could not build lookup key from provided identifiers")

    target_data = await asyncio.to_thread(get_cached_lightweight, cache_key)
    if target_data is None:
        raise HTTPException(
            404,
            "Target song not found in cache. Analyze it first via /clusters/analyze.",
        )

    target_scores = target_data["region_scores"]

    exclude_keys: set[str] = {cache_key}
    user_id = _try_get_user_id(authorization)
    if user_id and req.exclude_previously_recommended:
        prev = await asyncio.to_thread(get_previously_recommended, user_id)
        exclude_keys |= prev

    similar, catalog_size = await asyncio.to_thread(
        find_similar_songs,
        target_scores=target_scores,
        exclude_keys=exclude_keys,
        n=req.n,
    )

    target_info = SongInfo(
        song_id=cache_key,
        title=target_data["title"],
        artist=target_data["artist"],
    )
    recommendations = [
        SongMatch(
            song=SongInfo(
                song_id=r["lookup_key"],
                title=r["title"],
                artist=r["artist"],
            ),
            similarity_score=r["similarity"],
            matching_regions=[
                region for region in r.get("region_scores", {})
                if abs(
                    getattr(target_scores, region, 0.0)
                    - float(r["region_scores"].get(region, 0.0))
                ) < 0.01
            ],
            source="brain_similarity",
        )
        for r in similar
    ]

    # Record these recommendations (non-blocking)
    if user_id and similar:
        asyncio.get_event_loop().run_in_executor(
            None, record_recommendations, user_id,
            [{**r, "source": "brain_similarity"} for r in similar],
        )

    return SimilarResponse(
        target=target_info,
        catalog_size=catalog_size,
        recommendations=recommendations,
    )


# ── Collaborative filtering ────────────────────────────────────────────────


@router.post("/collaborative", response_model=CollaborativeResponse)
async def get_collaborative(
    n: int = 10,
    authorization: str | None = Header(None),
):
    """'Users like you also like' — collaborative filtering.

    Requires authentication. Finds users who analyzed the same songs,
    then surfaces songs those users analyzed that the current user hasn't.
    """
    user_id = _require_user_id(authorization)

    collab_results, similar_user_count = await asyncio.to_thread(
        find_collaborative_recommendations,
        user_id=user_id,
        n=min(n, 50),
    )

    recommendations = [
        SongMatch(
            song=SongInfo(
                song_id=r["lookup_key"],
                title=r["title"],
                artist=r["artist"],
            ),
            similarity_score=r["similarity"],
            source="collaborative",
        )
        for r in collab_results
    ]

    # Record these recommendations (non-blocking)
    if collab_results:
        asyncio.get_event_loop().run_in_executor(
            None, record_recommendations, user_id, collab_results,
        )

    return CollaborativeResponse(
        recommendations=recommendations,
        similar_user_count=similar_user_count,
    )


# ── Recommendation history ──────────────────────────────────────────────────


@router.get("/history", response_model=RecommendationHistoryResponse)
async def get_history(authorization: str | None = Header(None)):
    """Get songs previously recommended to the authenticated user."""
    user_id = _require_user_id(authorization)

    history = await asyncio.to_thread(get_recommendation_history, user_id)

    songs = [
        SongMatch(
            song=SongInfo(
                song_id=r["lookup_key"],
                title=r["title"],
                artist=r["artist"],
            ),
            similarity_score=r.get("similarity", 0.0),
            source=r.get("source", "brain_similarity"),
        )
        for r in history
    ]

    return RecommendationHistoryResponse(
        songs=songs,
        total=len(songs),
    )


@router.delete("/history")
async def clear_history(authorization: str | None = Header(None)):
    """Clear all recommendation history for the authenticated user.

    This resets de-duplication — the user will start seeing previously
    recommended songs again.
    """
    user_id = _require_user_id(authorization)
    count = await asyncio.to_thread(clear_recommendation_history, user_id)
    return {"cleared": count}


# ── Compare (unchanged) ────────────────────────────────────────────────────


@router.post("/compare", response_model=CompareResponse)
async def compare_fingerprints(req: CompareRequest):
    """Compare two fingerprints and return full similarity breakdown.

    TODO: Retrieve fingerprints from storage and compute real comparison.
    """
    if len(req.fingerprint_ids) != 2:
        raise HTTPException(400, "Exactly 2 fingerprint IDs required")

    return CompareResponse(
        similarity_score=0.0,
        similarity_label="low",
        components=SimilarityComponents(
            global_score=0.0,
            temporal_arc=0.0,
            peak=0.0,
        ),
        matching_regions=[],
        largest_differences=[],
        summary="Comparison not yet implemented — awaiting catalog population.",
    )
