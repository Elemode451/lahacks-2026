"""Listener cluster mode: analyze a group of songs for resonance."""

from __future__ import annotations

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
from app.services.recommendations import (
    compare_songs,
    compute_cluster_coherence,
    final_similarity,
    find_odd_one_out,
)
from app.services.spotify import get_track_info, search_youtube_for_track
from app.services.tribe import SongFingerprints, analyze_audio

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.post("/analyze", response_model=ClusterAnalyzeResponse)
async def analyze_cluster(req: ClusterAnalyzeRequest):
    """Analyze a set of songs for predicted cortical-response coherence.

    For each song:
    1. Resolve Spotify metadata (if spotify_id provided).
    2. Find a YouTube source for the audio.
    3. Download audio via yt-dlp.
    4. Run TRIBE v2 (or mock) fingerprinting.

    Then compute cluster coherence using weighted similarity
    (0.5 global + 0.3 temporal arc + 0.2 peak).
    """
    if len(req.songs) < 2:
        raise HTTPException(400, "Need at least 2 songs for a cluster")

    songs: list[SongInfo] = []
    fingerprints: list[SongFingerprints] = []
    audio_paths = []

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

            audio_path = download_youtube_audio(youtube_url)
            audio_paths.append(audio_path)

            song_id = f"song_{uuid.uuid4().hex[:12]}"
            song_info = SongInfo(
                song_id=song_id,
                spotify_id=cluster_song.spotify_id,
                title=title,
                artist=artist,
            )
            songs.append(song_info)

            song_fp = await analyze_audio(audio_path)
            fingerprints.append(song_fp)

        except Exception:
            logger.exception(
                "Failed to process song: %s", cluster_song.model_dump()
            )
            continue

    try:
        if len(songs) < 2:
            raise HTTPException(
                400,
                "Could not process enough songs. Need at least 2 successful.",
            )

        coherence_score, coherence_label = compute_cluster_coherence(fingerprints)

        # Pairwise similarities with full component breakdown
        pairwise: list[PairwiseSimilarity] = []
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

        odd_one_out = find_odd_one_out(songs, fingerprints)

        summary = (
            f"These {len(songs)} songs form a {coherence_label} resonance cluster "
            f"(coherence: {coherence_score:.2f}). "
        )
        if coherence_label == "strong":
            summary += "They are predicted to produce similar cortical-response patterns."
        elif coherence_label == "moderate":
            summary += "They share some predicted cortical-response patterns but have notable differences."
        else:
            summary += "They produce quite different predicted cortical-response patterns."

        if odd_one_out:
            summary += f" '{odd_one_out.title}' is the most dissimilar song in the set."

        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

        return ClusterAnalyzeResponse(
            analysis_id=analysis_id,
            coherence_score=coherence_score,
            coherence_label=coherence_label,
            songs=songs,
            pairwise_similarities=pairwise,
            odd_one_out=odd_one_out,
            recommendations=[],
            frames=[],
            summary=summary,
        )

    finally:
        for p in audio_paths:
            cleanup_audio(p)
