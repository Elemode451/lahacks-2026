"""Recommendation and comparison endpoints."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Header

from app.models.schemas import (
    CompareRequest,
    CompareResponse,
    RecommendRequest,
    RecommendResponse,
    SimilarityComponents,
    SongInfo,
    SongMatch,
)
from app.services.song_cache import (
    find_collaborative_recommendations,
    find_similar_songs,
    get_cached_lightweight,
    get_previously_recommended,
    make_lookup_key,
    record_recommendations,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["recommendations"])

# Blending weights: brain similarity vs collaborative filtering
_W_BRAIN = 0.6
_W_COLLAB = 0.4


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


@router.post("/recommendations", response_model=RecommendResponse)
async def get_recommendations(
    req: RecommendRequest,
    authorization: str | None = Header(None),
):
    """Find songs with similar brain-response patterns, blended with
    collaborative filtering ("users like you also like").

    Authenticated users get personalized results:
    - Previously recommended songs are excluded (unless include_previously_recommended=true)
    - Collaborative filtering surfaces songs from users with similar taste
    - Recommendations are tracked so future requests return fresh results

    Unauthenticated users get brain-similarity-only results (still useful,
    just not personalized).
    """
    if not req.youtube_url and not req.spotify_id:
        raise HTTPException(400, "Provide either youtube_url or spotify_id")

    cache_key = make_lookup_key(
        youtube_url=req.youtube_url,
        spotify_id=req.spotify_id,
    )
    if not cache_key:
        raise HTTPException(400, "Could not build lookup key from provided identifiers")

    user_id = _try_get_user_id(authorization)

    # Single lightweight query: region_scores + title + artist (no blob decompression)
    target_data = await asyncio.to_thread(get_cached_lightweight, cache_key)
    if target_data is None:
        raise HTTPException(
            404,
            "Target song not found in cache. Analyze it first via /clusters/analyze.",
        )

    target_scores = target_data["region_scores"]

    # Get previously recommended songs for this user (for de-duplication)
    prev_recommended: set[str] = set()
    if user_id and not req.include_previously_recommended:
        prev_recommended = await asyncio.to_thread(get_previously_recommended, user_id)

    # Build the exclusion set (target song + already recommended)
    exclude_keys = {cache_key} | prev_recommended

    # ── Brain similarity recommendations ────────────────────────────────────
    # Request extra candidates to leave room for collaborative results
    brain_n = req.n + 5
    brain_results, catalog_size = await asyncio.to_thread(
        find_similar_songs,
        target_scores=target_scores,
        exclude_keys=exclude_keys,
        n=brain_n,
    )
    for r in brain_results:
        r["source"] = "brain_similarity"

    # ── Collaborative filtering ("users like you also like") ────────────────
    collab_results: list[dict] = []
    collab_available = False
    if user_id:
        collab_results = await asyncio.to_thread(
            find_collaborative_recommendations,
            user_id=user_id,
            exclude_keys=exclude_keys,
            n=req.n,
        )
        collab_available = len(collab_results) > 0

    # ── Blend results ───────────────────────────────────────────────────────
    # Merge brain + collaborative results, avoiding duplicates.
    # Songs appearing in both lists get a boosted blended score.
    brain_by_key = {r["lookup_key"]: r for r in brain_results}
    collab_by_key = {r["lookup_key"]: r for r in collab_results}
    all_keys = list(brain_by_key.keys())
    for k in collab_by_key:
        if k not in brain_by_key:
            all_keys.append(k)

    blended: list[dict] = []
    for key in all_keys:
        brain = brain_by_key.get(key)
        collab = collab_by_key.get(key)

        if brain and collab:
            # Song found by both signals — boost it
            score = _W_BRAIN * brain["similarity"] + _W_COLLAB * collab["similarity"]
            entry = {**brain, "similarity": round(score, 4), "source": "both"}
        elif brain:
            entry = {**brain, "similarity": round(brain["similarity"] * _W_BRAIN, 4)}
        else:
            entry = {**collab, "similarity": round(collab["similarity"] * _W_COLLAB, 4)}

        blended.append(entry)

    blended.sort(key=lambda x: x["similarity"], reverse=True)
    final = blended[: req.n]

    # ── Build response ──────────────────────────────────────────────────────
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
            source=r.get("source", "brain_similarity"),
        )
        for r in final
    ]

    # ── Record recommendations for this user (non-blocking) ─────────────────
    if user_id and final:
        asyncio.get_event_loop().run_in_executor(
            None, record_recommendations, user_id, final,
        )

    return RecommendResponse(
        target=target_info,
        catalog_size=catalog_size,
        recommendations=recommendations,
        collaborative_available=collab_available,
    )


@router.post("/compare", response_model=CompareResponse)
async def compare_fingerprints(req: CompareRequest):
    """Compare two fingerprints and return full similarity breakdown.

    Returns global, temporal arc, and peak similarity components,
    plus region-level matching/differences.

    TODO: Retrieve fingerprints from storage and compute real comparison.
    """
    if len(req.fingerprint_ids) != 2:
        raise HTTPException(400, "Exactly 2 fingerprint IDs required")

    # TODO: Retrieve fingerprints and compute real comparison
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
