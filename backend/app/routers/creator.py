"""Creator mode: upload a track and analyze its predicted cortical response."""

from __future__ import annotations

import collections
import logging
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

import numpy as np
from app.models.schemas import CreatorAnalyzeResponse, SongInfo
from app.services.audio import cleanup_audio, save_uploaded_audio
from app.services.tribe import (
    _average_timelines,
    _resample_raw,
    analyze_audio,
    describe_vibe,
    encode_fingerprint_b64,
    encode_temporal_b64,
    resample_sequence,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/creator", tags=["creator"])

# In-memory store for creator analyses (not persisted to DB — user's uploaded
# songs should NOT go in the catalog database per the spec).
# Capped at 200 entries to prevent unbounded memory growth.
_MAX_CREATOR_CACHE = 200
_creator_analyses: collections.OrderedDict[str, dict] = collections.OrderedDict()


@router.post("/analyze", response_model=CreatorAnalyzeResponse)
async def analyze_creator_track(
    audio: UploadFile = File(...),
    title: str = Form("Untitled"),
    artist: str = Form("Unknown"),
):
    """Analyze an uploaded track in creator mode.

    The uploaded song is NOT stored in the catalog database.
    Returns the same TRIBE v2 analysis as listener mode: global fingerprint,
    temporal fingerprints, peak fingerprint, region scores, and timeline.
    """
    if audio.content_type and not audio.content_type.startswith("audio/"):
        raise HTTPException(400, f"Expected audio file, got {audio.content_type}")

    file_bytes = await audio.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "Empty audio file")

    audio_path = await save_uploaded_audio(file_bytes, audio.filename or "upload.wav")

    try:
        song_fp = await analyze_audio(audio_path)

        song_id = f"creator_{uuid.uuid4().hex[:12]}"
        song = SongInfo(
            song_id=song_id,
            title=title,
            artist=artist,
        )

        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

        # Encode fingerprints for brain visualization (same as cluster mode)
        fp_b64 = encode_fingerprint_b64(song_fp.global_fingerprint)
        temporal_resampled = resample_sequence(song_fp.temporal_fingerprints)
        temporal_b64 = encode_temporal_b64(temporal_resampled)

        # Resampled timeline from raw prediction data (not normalized)
        combined_timeline = _average_timelines([song_fp.timeline_region_scores])

        # Peak segment in resampled 30-segment space
        raw_resampled = _resample_raw(song_fp.temporal_fingerprints)
        peak_norms = [float(np.linalg.norm(v)) for v in raw_resampled]
        peak_seg = int(np.argmax(peak_norms))

        vibe = describe_vibe(song_fp.region_scores)

        # Generate summary
        top_regions = sorted(
            song_fp.region_scores.model_dump().items(),
            key=lambda x: x[1],
            reverse=True,
        )[:3]
        region_names = [
            r[0].replace("_", " ")
            for r in top_regions
            if r[0] != "whole_cortex"
        ]
        summary = (
            f"This track is predicted to strongly engage "
            f"{', '.join(region_names[:2])} regions. "
            f"Peak activation occurs at segment {peak_seg}. {vibe}"
        )

        # TODO: find top matches from catalog DB
        top_matches = []

        result = CreatorAnalyzeResponse(
            analysis_id=analysis_id,
            song=song,
            fingerprint_id=song_fp.fingerprint_id,
            region_scores=song_fp.region_scores,
            timeline_region_scores=song_fp.timeline_region_scores,
            peak_segment=peak_seg,
            frames=[],
            top_matches=top_matches,
            summary=summary,
            combined_fingerprint_b64=fp_b64,
            temporal_fingerprints_b64=temporal_b64,
            combined_region_scores=song_fp.region_scores,
            combined_timeline=combined_timeline,
            vibe_description=vibe,
        )

        # Store in memory (not DB) so the user can retrieve it during the session
        _creator_analyses[analysis_id] = result.model_dump()
        while len(_creator_analyses) > _MAX_CREATOR_CACHE:
            _creator_analyses.popitem(last=False)

        return result

    finally:
        cleanup_audio(audio_path)
