"""Recommendation and comparison endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CompareRequest,
    CompareResponse,
    RecommendRequest,
    RecommendResponse,
)

router = APIRouter(tags=["recommendations"])


@router.post("/recommendations", response_model=RecommendResponse)
async def get_recommendations(req: RecommendRequest):
    """Get song recommendations based on a fingerprint.

    TODO: Once the catalog is populated, this will search for the most
    similar songs in the database. For now returns empty results.
    """
    # TODO: Load catalog from Supabase, compute similarities
    return RecommendResponse(recommendations=[])


@router.post("/compare", response_model=CompareResponse)
async def compare_fingerprints(req: CompareRequest):
    """Compare two fingerprints and return similarity details.

    TODO: Retrieve fingerprints from storage and compute comparison.
    """
    if len(req.fingerprint_ids) != 2:
        raise HTTPException(400, "Exactly 2 fingerprint IDs required")

    # TODO: Retrieve fingerprints and compute real comparison
    return CompareResponse(
        similarity_score=0.0,
        region_comparison={},
        summary="Comparison not yet implemented — awaiting catalog population.",
    )
