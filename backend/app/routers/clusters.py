"""Listener / playlist mode: analyze one or more songs and return aggregate brain data."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import StreamingResponse

from app.models.schemas import (
    ClusterAnalyzeRequest,
    ClusterAnalyzeResponse,
    ClusterSong,
    KeyAnalysis,
    KeyComparison,
    KeyInfo,
    PairwiseSimilarity,
    SongInfo,
    SongMatch,
)
from app.services.audio import cleanup_audio, download_youtube_audio
from app.services.emotions import map_region_scores_to_emotions
from app.services.recommendations import compare_songs, final_similarity
from app.config import settings
from app.services.song_cache import find_similar_songs, get_cached, make_lookup_key, record_user_interaction, save_analysis
from app.services.spotify import get_audio_features_batch, get_playlist_tracks, get_track_info, parse_playlist_id, search_youtube_for_track
from app.services.music_theory import compare_keys, key_name, mood_for_key
from app.services.tribe import (
    SongFingerprints,
    aggregate_fingerprints,
    analyze_audio,
    describe_vibe,
    encode_fingerprint_b64,
    encode_temporal_b64,
    resample_sequence,
)
from app.utils.auth import try_get_user_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/clusters", tags=["clusters"])


async def _build_key_analysis(songs: list[SongInfo]) -> KeyAnalysis | None:
    """Fetch Spotify audio features and build a KeyAnalysis for the given songs."""
    spotify_ids = [s.spotify_id for s in songs if s.spotify_id]
    if not spotify_ids:
        return None

    try:
        features_list = await get_audio_features_batch(spotify_ids)
    except Exception:
        logger.warning("Failed to fetch audio features batch")
        return None

    # Map spotify_id → features dict
    feat_by_id: dict[str, dict] = {}
    for feat in features_list:
        sid = feat.get("id")
        if sid:
            feat_by_id[sid] = feat

    song_keys: dict[str, KeyInfo] = {}
    keyed_songs: list[tuple[str, int, int]] = []  # (song_id, key, mode)

    for song in songs:
        if not song.spotify_id or song.spotify_id not in feat_by_id:
            continue
        feat = feat_by_id[song.spotify_id]
        k = feat.get("key")
        m = feat.get("mode")
        if k is None or m is None or k < 0:
            continue
        ki = KeyInfo(
            key=k,
            mode=m,
            key_name=key_name(k, m),
            tempo=feat.get("tempo"),
            time_signature=feat.get("time_signature"),
            mood=mood_for_key(k, m),
        )
        song_keys[song.song_id] = ki
        song.key_info = ki
        keyed_songs.append((song.song_id, k, m))

    if not song_keys:
        return None

    # Pairwise key comparisons
    comparisons: list[KeyComparison] = []
    if len(keyed_songs) > 1:
        for i in range(len(keyed_songs)):
            for j in range(i + 1, len(keyed_songs)):
                sid_a, ka, ma = keyed_songs[i]
                sid_b, kb, mb = keyed_songs[j]
                result = compare_keys(ka, ma, kb, mb)
                comparisons.append(KeyComparison(
                    song_a=sid_a,
                    song_b=sid_b,
                    distance=result["distance"],
                    relationship=result["relationship"],
                    description=result["description"],
                ))

    # Summary
    key_names_list = [ki.key_name for ki in song_keys.values() if ki.key_name]
    if len(key_names_list) == 1:
        summary = f"The track is in {key_names_list[0]}."
        mood = list(song_keys.values())[0].mood
        if mood:
            summary += f" Mood: {mood}."
    elif comparisons:
        close = sum(1 for c in comparisons if c.distance <= 1)
        total = len(comparisons)
        summary = f"Keys detected: {', '.join(key_names_list)}. "
        if close == total:
            summary += "All songs are in closely related keys."
        elif close > 0:
            summary += f"{close}/{total} pairs are closely related."
        else:
            summary += "The songs span distant keys, creating harmonic variety."
    else:
        summary = f"Keys detected: {', '.join(key_names_list)}."

    return KeyAnalysis(
        song_keys=song_keys,
        pairwise_key_comparisons=comparisons,
        summary=summary,
    )


@router.post("/analyze", response_model=ClusterAnalyzeResponse)
async def analyze_cluster(
    req: ClusterAnalyzeRequest,
    authorization: str | None = Header(None),
):
    """Analyze one or more songs and return aggregate brain activation data.

    ## Pipeline

    For each song the backend:
    1. Checks the **Supabase cache** — if this song was analyzed before, its
       fingerprints are loaded instantly (no GPU needed).
    2. Resolves **Spotify metadata** (if `spotify_id` is provided).
    3. Finds a **YouTube source** for the audio (auto-search if only Spotify ID given).
    4. Downloads audio via **yt-dlp**.
    5. Runs **TRIBE v2** inference on a remote GPU worker (~30–60 s per song).
    6. Caches the result in Supabase for future instant retrieval.

    After all songs are processed, fingerprints are **aggregated** (averaged)
    into a single combined brain response.

    ## Response Overview

    | Field | Type | Size | Purpose |
    |---|---|---|---|
    | `combined_fingerprint_b64` | base64 string | ~109 KB | 20,484 float32 vertex activations for brain mesh coloring |
    | `temporal_fingerprints_b64` | base64 string | ~3.2 MB | 30 × 20,484 float32 for timeline scrubbing |
    | `combined_region_scores` | JSON object | ~100 B | Per-region activation (auditory, temporal, etc.) |
    | `combined_timeline` | JSON array | ~2 KB | 30 segments × 6 region scores for timeline chart |
    | `vibe_description` | string | ~200 B | Human-readable brain activation interpretation |
    | `pairwise_similarities` | JSON array | varies | Song-to-song similarity (only when >1 song) |

    Total response: **~3.3 MB JSON**, **~500 KB–1 MB** with HTTP gzip compression.

    ## Frontend Decoding (JavaScript)

    ```js
    // Decode combined fingerprint (20,484 floats)
    const fpBytes = Uint8Array.from(
      atob(data.combined_fingerprint_b64), c => c.charCodeAt(0)
    );
    const vertices = new Float32Array(fpBytes.buffer);
    // vertices[i] → activation for cortical vertex i on fsaverage5 mesh

    // Decode temporal scrubbing data (30 segments × 20,484 floats)
    const tempBytes = Uint8Array.from(
      atob(data.temporal_fingerprints_b64), c => c.charCodeAt(0)
    );
    const allSegments = new Float32Array(tempBytes.buffer);
    // Segment i: allSegments.slice(i * 20484, (i + 1) * 20484)
    ```
    """
    # Resolve Spotify playlist into individual songs
    all_cluster_songs = list(req.songs)
    if req.spotify_playlist_url:
        playlist_id = parse_playlist_id(req.spotify_playlist_url)
        if not playlist_id:
            raise HTTPException(400, "Could not parse Spotify playlist URL")

        playlist_tracks = await get_playlist_tracks(playlist_id)
        if not playlist_tracks:
            raise HTTPException(404, "Playlist is empty or could not be fetched")

        for track in playlist_tracks:
            all_cluster_songs.append(
                ClusterSong(
                    spotify_id=track.spotify_id,
                    title=track.title,
                    artist=track.artist,
                )
            )
        logger.info(
            "Resolved Spotify playlist %s → %d tracks",
            playlist_id, len(playlist_tracks),
        )

    if not all_cluster_songs:
        raise HTTPException(400, "Provide at least one song or a playlist URL")

    songs: list[SongInfo] = []
    fingerprints: list[SongFingerprints] = []
    song_cache_keys: list[str] = []
    audio_paths: list = []
    user_id = try_get_user_id(authorization)

    for cluster_song in all_cluster_songs:
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
            song_cache_keys.append(cache_key or "")

            # Track interaction for collaborative filtering
            if user_id and cache_key:
                asyncio.get_running_loop().run_in_executor(
                    None, record_user_interaction, user_id, cache_key,
                )

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
        emotional_profile = map_region_scores_to_emotions(combined.region_scores)

        # Pairwise similarities (only when 2–20 songs; skip for large batches)
        pairwise: list[PairwiseSimilarity] = []
        if 1 < len(songs) <= 20:
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

        # Key analysis (non-blocking — failures are tolerated)
        key_analysis: KeyAnalysis | None = None
        try:
            key_analysis = await _build_key_analysis(songs)
        except Exception:
            logger.warning("Key analysis failed, continuing without it")

        n = len(songs)
        summary = f"Analyzed {n} song{'s' if n > 1 else ''}"
        if n > 1 and pairwise:
            avg_sim = sum(p.similarity for p in pairwise) / len(pairwise)
            summary += f" with average pairwise similarity of {avg_sim:.2f}"
        summary += f". {vibe}"

        analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

        # ── Persist analysis ────────────────────────────────────────
        persist_payload = {
            "songs": [s.model_dump() for s in songs],
            "song_cache_keys": song_cache_keys,
            "combined_region_scores": combined.region_scores.model_dump(),
            "combined_timeline": combined.timeline_region_scores,
            "peak_segment": combined.peak_index,
            "vibe_description": vibe,
            "pairwise_similarities": [p.model_dump() for p in pairwise],
            "summary": summary,
            "key_analysis": key_analysis.model_dump() if key_analysis else None,
            "emotional_profile": emotional_profile,
        }
        saved = False
        try:
            loop = asyncio.get_running_loop()
            saved = await loop.run_in_executor(
                None,
                save_analysis,
                analysis_id,
                "listener_cluster",
                req.title,
                persist_payload,
                user_id,
            )
        except Exception:
            logger.warning("Analysis persistence failed for %s", analysis_id)

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
            key_analysis=key_analysis,
            summary=summary,
            saved=bool(saved),
            emotional_profile=emotional_profile,
        )

    finally:
        for p in audio_paths:
            cleanup_audio(p)


# ── SSE streaming endpoint ──────────────────────────────────────────────────


def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/analyze/stream")
async def analyze_cluster_stream(
    req: ClusterAnalyzeRequest,
    request: Request,
    authorization: str | None = Header(None),
):
    """Stream analysis results via Server-Sent Events.

    Same logic as POST /analyze, but notifies the client each time a
    song finishes and is committed to the database — no intermediate
    polling or progress spam.

    ## SSE Events

    | Event | Data | Description |
    |-------|------|-------------|
    | `song_complete` | `{song, index, total, cached}` | Song finished and cached to DB |
    | `song_error` | `{song, index, total, error}` | Song failed (skipped) |
    | `complete` | Full ClusterAnalyzeResponse JSON | All songs done |
    | `error` | `{message}` | Fatal error |

    ## Frontend Usage

    ```js
    const resp = await fetch('/clusters/analyze/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    // Parse SSE events from the stream
    ```
    """

    async def event_generator():
        # Resolve songs (same as non-streaming)
        all_cluster_songs = list(req.songs)
        if req.spotify_playlist_url:
            playlist_id = parse_playlist_id(req.spotify_playlist_url)
            if not playlist_id:
                yield _sse_event("error", {"message": "Could not parse Spotify playlist URL"})
                return

            playlist_tracks = await get_playlist_tracks(playlist_id)
            if not playlist_tracks:
                yield _sse_event("error", {"message": "Playlist is empty or could not be fetched"})
                return

            for track in playlist_tracks:
                all_cluster_songs.append(
                    ClusterSong(
                        spotify_id=track.spotify_id,
                        title=track.title,
                        artist=track.artist,
                    )
                )
            yield _sse_event("progress", {
                "message": f"Resolved playlist: {len(playlist_tracks)} tracks",
                "total": len(all_cluster_songs),
            })

        if not all_cluster_songs:
            yield _sse_event("error", {"message": "No songs to analyze"})
            return

        total = len(all_cluster_songs)
        songs: list[SongInfo] = []
        fingerprints: list[SongFingerprints] = []
        song_cache_keys: list[str] = []
        audio_paths: list = []
        user_id = try_get_user_id(authorization)

        try:
            for idx, cluster_song in enumerate(all_cluster_songs):
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info("Client disconnected, stopping stream")
                    return

                title = cluster_song.title or "Unknown"
                artist = cluster_song.artist or "Unknown"

                try:
                    youtube_url = cluster_song.youtube_url

                    if cluster_song.spotify_id:
                        info = await get_track_info(cluster_song.spotify_id)
                        if info:
                            title = info.title
                            artist = info.artist
                        if not youtube_url:
                            youtube_url = await search_youtube_for_track(title, artist)

                    if not youtube_url:
                        yield _sse_event("song_error", {
                            "song": f"{artist} - {title}",
                            "index": idx + 1,
                            "total": total,
                            "error": "No audio source found",
                        })
                        continue

                    cache_key = make_lookup_key(
                        youtube_url=youtube_url,
                        spotify_id=cluster_song.spotify_id,
                    )

                    song_fp = None
                    cached = False
                    if cache_key and not settings.use_mock_tribe:
                        song_fp = await asyncio.to_thread(get_cached, cache_key)
                        if song_fp:
                            cached = True

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
                    song_cache_keys.append(cache_key or "")

                    if user_id and cache_key:
                        asyncio.get_running_loop().run_in_executor(
                            None, record_user_interaction, user_id, cache_key,
                        )

                    # Notify client only after song is cached to DB
                    yield _sse_event("song_complete", {
                        "song": f"{artist} - {title}",
                        "index": idx + 1,
                        "total": total,
                        "cached": cached,
                    })

                except Exception:
                    logger.exception("Failed to process song: %s", cluster_song.model_dump())
                    yield _sse_event("song_error", {
                        "song": f"{artist} - {title}",
                        "index": idx + 1,
                        "total": total,
                        "error": "Processing failed for this song",
                    })
                    continue

            # ── Build final response ────────────────────────────────────
            if not songs:
                yield _sse_event("error", {"message": "Could not process any songs"})
                return

            combined = aggregate_fingerprints(fingerprints)
            combined_fp_b64 = encode_fingerprint_b64(combined.global_fingerprint)
            temporal_resampled = resample_sequence(combined.temporal_fingerprints)
            temporal_b64 = encode_temporal_b64(temporal_resampled)
            vibe = describe_vibe(combined.region_scores)
            emotional_profile = map_region_scores_to_emotions(combined.region_scores)

            pairwise: list[PairwiseSimilarity] = []
            if 1 < len(songs) <= 20:
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

            # Key analysis (non-blocking)
            key_analysis: KeyAnalysis | None = None
            try:
                key_analysis = await _build_key_analysis(songs)
            except Exception:
                logger.warning("Key analysis failed in stream, continuing without it")

            n = len(songs)
            summary = f"Analyzed {n} song{'s' if n > 1 else ''}"
            if n > 1 and pairwise:
                avg_sim = sum(p.similarity for p in pairwise) / len(pairwise)
                summary += f" with average pairwise similarity of {avg_sim:.2f}"
            summary += f". {vibe}"

            analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

            # ── Persist analysis ────────────────────────────────────
            persist_payload = {
                "songs": [s.model_dump() for s in songs],
                "song_cache_keys": song_cache_keys,
                "combined_region_scores": combined.region_scores.model_dump(),
                "combined_timeline": combined.timeline_region_scores,
                "peak_segment": combined.peak_index,
                "vibe_description": vibe,
                "pairwise_similarities": [p.model_dump() for p in pairwise],
                "summary": summary,
                "key_analysis": key_analysis.model_dump() if key_analysis else None,
                "emotional_profile": emotional_profile,
            }
            saved = False
            try:
                saved = await asyncio.to_thread(
                    save_analysis,
                    analysis_id,
                    "listener_cluster",
                    req.title,
                    persist_payload,
                    user_id,
                )
            except Exception:
                logger.warning("Analysis persistence failed for %s", analysis_id)

            # Find similar songs in the catalog for recommendations
            top_matches: list[SongMatch] = []
            try:
                exclude = set(song_cache_keys)
                similar, _ = await asyncio.to_thread(
                    find_similar_songs,
                    target_scores=combined.region_scores,
                    exclude_keys=exclude,
                    n=10,
                )
                top_matches = [
                    SongMatch(
                        song=SongInfo(
                            song_id=r["lookup_key"],
                            title=r["title"],
                            artist=r["artist"],
                        ),
                        similarity_score=r["similarity"],
                        source="brain_similarity",
                    )
                    for r in similar
                ]
            except Exception:
                logger.warning("Failed to find similar songs for listener analysis")

            response = ClusterAnalyzeResponse(
                analysis_id=analysis_id,
                songs=songs,
                combined_fingerprint_b64=combined_fp_b64,
                temporal_fingerprints_b64=temporal_b64,
                combined_region_scores=combined.region_scores,
                combined_timeline=combined.timeline_region_scores,
                peak_segment=combined.peak_index,
                vibe_description=vibe,
                pairwise_similarities=pairwise,
                key_analysis=key_analysis,
                summary=summary,
                saved=bool(saved),
                emotional_profile=emotional_profile,
                top_matches=top_matches,
            )

            yield _sse_event("complete", response.model_dump())

        except Exception:
            logger.exception("Stream aggregation failed")
            yield _sse_event("error", {"message": "Analysis failed — please try again"})
        finally:
            for p in audio_paths:
                cleanup_audio(p)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
