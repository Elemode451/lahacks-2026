"""Creator mode: upload a track and analyze its predicted cortical response."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile

import numpy as np
from app.models.schemas import AnalysisSummary, CreatorAnalyzeResponse, SongInfo
from app.services.audio import cleanup_audio, save_uploaded_audio
from app.services.emotions import map_region_scores_to_emotions
from app.services.song_cache import record_user_interaction, save_analysis, store_cached
from app.services.tribe import (
    _average_timelines,
    _resample_raw,
    analyze_audio,
    describe_vibe,
    encode_fingerprint_b64,
    encode_temporal_b64,
    resample_sequence,
)
from app.utils.auth import require_auth, try_get_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/creator", tags=["creator"])

def _upload_lookup_key(filename: str, file_bytes: bytes) -> str:
    """Build a deterministic lookup key for an uploaded file."""
    file_hash = hashlib.sha256(file_bytes).hexdigest()[:16]
    return f"upload:{file_hash}"


@router.post("/analyze", response_model=CreatorAnalyzeResponse)
async def analyze_creator_track(
    audio: UploadFile = File(...),
    title: str = Form("Untitled"),
    artist: str = Form("Unknown"),
    authorization: str | None = Header(None),
):
    """Analyze an uploaded track in creator mode.

    The song is persisted to ``song_cache`` so the recommendation engine can
    discover it, and an analysis record is saved to the ``analyses`` table for
    the authenticated user (if any).
    """
    ct = audio.content_type or ""
    allowed_prefixes = ("audio/", "video/", "application/octet-stream", "application/ogg")
    if ct and not any(ct.startswith(p) for p in allowed_prefixes):
        raise HTTPException(400, f"Expected audio file, got {ct}")

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
        emotional_profile = map_region_scores_to_emotions(song_fp.region_scores)

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
            emotional_profile=emotional_profile,
        )

        # Persist to song_cache so the recommendation engine can find it
        lookup_key = _upload_lookup_key(audio.filename or "upload.wav", file_bytes)
        try:
            await asyncio.to_thread(
                store_cached,
                lookup_key=lookup_key,
                fingerprints=song_fp,
                title=title,
                artist=artist,
            )
        except Exception:
            logger.exception("Failed to cache creator upload %s", lookup_key)

        # Save analysis + record interaction for authenticated users
        user_id = try_get_user_id(authorization)
        if user_id:
            asyncio.get_running_loop().run_in_executor(
                None, record_user_interaction, user_id, lookup_key, "uploaded",
            )

        # Persist analysis to Supabase (non-blocking)
        creator_payload = {
            "song": song.model_dump(),
            "fingerprint_id": song_fp.fingerprint_id,
            "region_scores": song_fp.region_scores.model_dump(),
            "timeline_region_scores": song_fp.timeline_region_scores,
            "peak_segment": peak_seg,
            "summary": summary,
        }
        asyncio.get_running_loop().run_in_executor(
            None,
            save_analysis,
            analysis_id,
            "creator",
            title,
            creator_payload,
            user_id,
        )

        return result

    finally:
        cleanup_audio(audio_path)


@router.get("/analyses", response_model=list[AnalysisSummary])
async def list_creator_analyses(user_id: str = Depends(require_auth)):
    """Return the authenticated user's saved creator analyses."""
    try:
        from app.services.supabase_client import get_supabase_admin

        sb = get_supabase_admin()
        resp = (
            sb.table("analyses")
            .select("id, kind, title, created_at, share_slug")
            .eq("owner_id", user_id)
            .eq("kind", "creator")
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
            for row in (resp.data or [])
        ]
    except Exception:
        logger.exception("Failed to list creator analyses for user %s", user_id)
        raise HTTPException(500, "Failed to retrieve analyses")
