"""Recommendation and comparison endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    CompareRequest,
    CompareResponse,
    RecommendRequest,
    RecommendResponse,
    SimilarityComponents,
)

router = APIRouter(tags=["recommendations"])


@router.post("/recommendations", response_model=RecommendResponse)
async def get_recommendations(req: RecommendRequest):
    """Get song recommendations based on a fingerprint.

    TODO: Once the catalog is populated, this will search for the most
    similar songs in the database using weighted similarity
    (0.5 global + 0.3 temporal arc + 0.2 peak).
    """
    # TODO: Load catalog from Supabase, compute similarities
    return RecommendResponse(recommendations=[])


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
