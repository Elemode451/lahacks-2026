"""Recommendation and comparison endpoints."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CompareRequest,
    CompareResponse,
    RecommendRequest,
    RecommendResponse,
    SimilarityComponents,
    SongInfo,
    SongMatch,
)
from app.services.song_cache import find_similar_songs, get_cached, make_lookup_key

logger = logging.getLogger(__name__)
router = APIRouter(tags=["recommendations"])


@router.post("/recommendations", response_model=RecommendResponse)
async def get_recommendations(req: RecommendRequest):
    """Find songs with similar brain-response patterns from the cached catalog.

    The target song must already be in the cache (i.e. previously analyzed
    via `/clusters/analyze`). The engine queries only the lightweight
    `region_scores` column (~100 bytes per row) and computes cosine
    similarity on the 6 brain region activation values — no fingerprint
    blob decompression needed.

    This is very fast — a single Supabase read + Python vector math.
    """
    if not req.youtube_url and not req.spotify_id:
        raise HTTPException(400, "Provide either youtube_url or spotify_id")

    cache_key = make_lookup_key(
        youtube_url=req.youtube_url,
        spotify_id=req.spotify_id,
    )
    if not cache_key:
        raise HTTPException(400, "Could not build lookup key from provided identifiers")

    # Load target fingerprint from cache (only need region_scores)
    target_fp = await asyncio.to_thread(get_cached, cache_key)
    if target_fp is None:
        raise HTTPException(
            404,
            "Target song not found in cache. Analyze it first via /clusters/analyze.",
        )

    # Find similar songs via lightweight region-score comparison
    similar = await asyncio.to_thread(
        find_similar_songs,
        target_scores=target_fp.region_scores,
        exclude_key=cache_key,
        n=req.n,
    )

    # Build response
    target_info = SongInfo(
        song_id=cache_key,
        title="Unknown",
        artist="Unknown",
    )
    # Try to get target metadata from similar results (it's excluded, so
    # we pull from cache data)
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
                    getattr(target_fp.region_scores, region, 0.0)
                    - float(r["region_scores"].get(region, 0.0))
                ) < 0.01
            ],
        )
        for r in similar
    ]

    return RecommendResponse(
        target=target_info,
        catalog_size=len(similar) + 1,  # +1 for excluded target
        recommendations=recommendations,
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
