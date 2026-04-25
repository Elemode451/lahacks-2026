"""Spotify search endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import SpotifySearchResponse
from app.services.spotify import search_tracks

router = APIRouter(prefix="/spotify", tags=["spotify"])


@router.get("/search", response_model=SpotifySearchResponse)
async def search(q: str = Query(..., min_length=1), limit: int = Query(20, ge=1, le=50)):
    """Search Spotify for tracks."""
    try:
        results = await search_tracks(q, limit=limit)
        return SpotifySearchResponse(results=results)
    except Exception as e:
        raise HTTPException(502, f"Spotify search failed: {e}")
