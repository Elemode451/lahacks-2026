"""Creator mode: upload a track and analyze its predicted cortical response."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.schemas import CreatorAnalyzeResponse, SongInfo
from app.services.audio import cleanup_audio, save_uploaded_audio
from app.services.tribe import get_fingerprint

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/creator", tags=["creator"])

# In-memory store for creator analyses (not persisted to DB — user's uploaded
# songs should NOT go in the catalog database per the spec)
_creator_analyses: dict[str, dict] = {}


@router.post("/analyze", response_model=CreatorAnalyzeResponse)
async def analyze_creator_track(
    audio: UploadFile = File(...),
    title: str = Form("Untitled"),
    artist: str = Form("Unknown"),
):
    """Analyze an uploaded track in creator mode.

    The uploaded song is NOT stored in the catalog database.
    It gets the same TRIBE v2 analysis as listener mode, but results
    are ephemeral (tied to this analysis only).
    """
    if audio.content_type and not audio.content_type.startswith("audio/"):
        raise HTTPException(400, f"Expected audio file, got {audio.content_type}")

    file_bytes = await audio.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "Empty audio file")

    audio_path = await save_uploaded_audio(file_bytes, audio.filename or "upload.wav")

    try:
        fingerprint_id, fingerprint, region_scores = await get_fingerprint(
            audio_path, song_id=None
        )

        song_id = f"creator_{uuid.uuid4().hex[:12]}"
        song = SongInfo(
            song_id=song_id,
            title=title,
            artist=artist,
        )

        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

        # TODO: generate brain visualization frames server-side
        frames: list[str] = []

        # TODO: find top matches from catalog DB
        top_matches = []

        # Generate summary
        top_regions = sorted(
            region_scores.model_dump().items(),
            key=lambda x: x[1],
            reverse=True,
        )[:3]
        region_names = [r[0].replace("_", " ") for r in top_regions if r[0] != "whole_cortex"]
        summary = (
            f"This track is predicted to strongly engage "
            f"{', '.join(region_names[:2])} regions."
        )

        result = CreatorAnalyzeResponse(
            analysis_id=analysis_id,
            song=song,
            fingerprint_id=fingerprint_id,
            region_scores=region_scores,
            frames=frames,
            top_matches=top_matches,
            summary=summary,
        )

        # Store in memory (not DB) so the user can retrieve it during the session
        _creator_analyses[analysis_id] = result.model_dump()

        return result

    finally:
        # Clean up uploaded audio — creator tracks are not stored
        cleanup_audio(audio_path)
