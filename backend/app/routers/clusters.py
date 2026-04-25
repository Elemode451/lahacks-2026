"""Listener / playlist mode: analyze one or more songs and return aggregate brain data."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ClusterAnalyzeRequest,
    ClusterAnalyzeResponse,
    PairwiseSimilarity,
    SongInfo,
)
from app.services.audio import cleanup_audio, download_youtube_audio
from app.services.recommendations import compare_songs, final_similarity
from app.config import settings
from app.services.song_cache import get_cached, make_lookup_key
from app.services.spotify import get_track_info, search_youtube_for_track
from app.services.tribe import (
    SongFingerprints,
    aggregate_fingerprints,
    analyze_audio,
    describe_vibe,
    encode_fingerprint_b64,
    encode_temporal_b64,
    resample_sequence,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.post("/analyze", response_model=ClusterAnalyzeResponse)
async def analyze_cluster(req: ClusterAnalyzeRequest):
    """Analyze one or more songs and return aggregate brain activation data.

    For each song:
    1. Check Supabase cache (skip download + inference if cached).
    2. Resolve Spotify metadata (if spotify_id provided).
    3. Find a YouTube source for the audio.
    4. Download audio via yt-dlp.
    5. Run TRIBE v2 (or mock) fingerprinting.

    Then aggregate all fingerprints into a single combined brain response
    and return the full vertex data for 3D visualization + scrubbing.
    """
    songs: list[SongInfo] = []
    fingerprints: list[SongFingerprints] = []
    audio_paths: list = []

    for cluster_song in req.songs:
        try:
            title = cluster_song.title or "Unknown"
            artist = cluster_song.artist or "Unknown"
            youtube_url = cluster_song.youtube_url

            if cluster_song.spotify_id:
                info = await get_track_info(cluster_song.spotify_id)
                if info:
                    title = info.title
                    artist = info.artist

                if not youtube_url:
                    youtube_url = await search_youtube_for_track(title, artist)

            if not youtube_url:
                logger.warning("No audio source for %s - %s, skipping", artist, title)
                continue

            cache_key = make_lookup_key(
                youtube_url=youtube_url,
                spotify_id=cluster_song.spotify_id,
            )

            # Check cache before downloading audio
            song_fp = None
            if cache_key and not settings.use_mock_tribe:
                song_fp = await asyncio.to_thread(get_cached, cache_key)

            if song_fp is None:
                audio_path = await asyncio.to_thread(
                    download_youtube_audio, youtube_url
                )
                audio_paths.append(audio_path)
                song_fp = await analyze_audio(
                    audio_path,
                    cache_key=cache_key,
                    title=title,
                    artist=artist,
                )

            song_id = f"song_{uuid.uuid4().hex[:12]}"
            song_info = SongInfo(
                song_id=song_id,
                spotify_id=cluster_song.spotify_id,
                title=title,
                artist=artist,
            )
            songs.append(song_info)
            fingerprints.append(song_fp)

        except Exception:
            logger.exception(
                "Failed to process song: %s", cluster_song.model_dump()
            )
            continue

    try:
        if not songs:
            raise HTTPException(
                400,
                "Could not process any songs successfully.",
            )

        # Aggregate all songs into one combined brain fingerprint
        combined = aggregate_fingerprints(fingerprints)

        # Encode vertex data as base64 for frontend (raw float32 bytes)
        combined_fp_b64 = encode_fingerprint_b64(combined.global_fingerprint)

        # Temporal fingerprints (30 resampled segments × 20484 vertices)
        temporal_resampled = resample_sequence(combined.temporal_fingerprints)
        temporal_b64 = encode_temporal_b64(temporal_resampled)

        # Vibe description from aggregate region scores
        vibe = describe_vibe(combined.region_scores)

        # Pairwise similarities (only when >1 song)
        pairwise: list[PairwiseSimilarity] = []
        if len(songs) > 1:
            for i in range(len(songs)):
                for j in range(i + 1, len(songs)):
                    components = compare_songs(fingerprints[i], fingerprints[j])
                    score = final_similarity(components)
                    pairwise.append(
                        PairwiseSimilarity(
                            song_a=songs[i].song_id,
                            song_b=songs[j].song_id,
                            similarity=score,
                            components=components,
                        )
                    )

        n = len(songs)
        summary = f"Analyzed {n} song{'s' if n > 1 else ''}"
        if n > 1 and pairwise:
            avg_sim = sum(p.similarity for p in pairwise) / len(pairwise)
            summary += f" with average pairwise similarity of {avg_sim:.2f}"
        summary += f". {vibe}"

        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

        return ClusterAnalyzeResponse(
            analysis_id=analysis_id,
            songs=songs,
            combined_fingerprint_b64=combined_fp_b64,
            temporal_fingerprints_b64=temporal_b64,
            combined_region_scores=combined.region_scores,
            combined_timeline=combined.timeline_region_scores,
            peak_segment=combined.peak_index,
            vibe_description=vibe,
            pairwise_similarities=pairwise,
            summary=summary,
        )

    finally:
        for p in audio_paths:
            cleanup_audio(p)
