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
    PairwiseSimilarity,
    SongInfo,
)
from app.services.audio import cleanup_audio, download_youtube_audio
from app.services.recommendations import compare_songs, final_similarity
from app.config import settings
from app.services.song_cache import get_cached, make_lookup_key, record_user_interaction
from app.services.spotify import get_playlist_tracks, get_track_info, parse_playlist_id, search_youtube_for_track
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

# ── In-memory batch tracking ────────────────────────────────────────────────
# Each batch has an asyncio.Queue that receives SSE-formatted events.
# Background task writes events; GET /batch/{id}/events reads them.

_batches: dict[str, dict] = {}
# batch_id -> {"events": asyncio.Queue, "task": asyncio.Task, "done": bool}



def _sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _resolve_songs(req: ClusterAnalyzeRequest) -> list[ClusterSong]:
    """Resolve request into a flat list of ClusterSong objects."""
    all_songs = list(req.songs)
    if req.spotify_playlist_url:
        playlist_id = parse_playlist_id(req.spotify_playlist_url)
        if not playlist_id:
            raise HTTPException(400, "Could not parse Spotify playlist URL")
        playlist_tracks = await get_playlist_tracks(playlist_id)
        if not playlist_tracks:
            raise HTTPException(404, "Playlist is empty or could not be fetched")
        for track in playlist_tracks:
            all_songs.append(
                ClusterSong(
                    spotify_id=track.spotify_id,
                    title=track.title,
                    artist=track.artist,
                )
            )
        logger.info("Resolved Spotify playlist %s -> %d tracks", playlist_id, len(playlist_tracks))
    if not all_songs:
        raise HTTPException(400, "Provide at least one song or a playlist URL")
    return all_songs


async def _process_batch(
    batch_id: str,
    all_cluster_songs: list[ClusterSong],
    user_id: str | None,
) -> None:
    """Process a batch of songs in the background.

    Pushes SSE events to the batch's asyncio.Queue as songs complete.
    Runs independently of any HTTP connection.
    """
    batch = _batches[batch_id]
    q: asyncio.Queue = batch["events"]
    total = len(all_cluster_songs)
    songs: list[SongInfo] = []
    fingerprints: list[SongFingerprints] = []
    audio_paths: list = []

    try:
        for idx, cluster_song in enumerate(all_cluster_songs):
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
                    logger.warning("No audio source for %s - %s, skipping", artist, title)
                    await q.put(_sse_event("song_error", {
                        "song": f"{artist} - {title}",
                        "index": idx + 1,
                        "total": total,
                        "error": "No audio source found",
                    }))
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

                if user_id and cache_key:
                    asyncio.get_event_loop().run_in_executor(
                        None, record_user_interaction, user_id, cache_key,
                    )

                await q.put(_sse_event("song_complete", {
                    "song": f"{artist} - {title}",
                    "index": idx + 1,
                    "total": total,
                    "cached": cached,
                }))

            except Exception as exc:
                logger.exception("Failed to process song: %s", cluster_song.model_dump())
                await q.put(_sse_event("song_error", {
                    "song": f"{artist} - {title}",
                    "index": idx + 1,
                    "total": total,
                    "error": str(exc),
                }))
                continue

        # ── Build final response ────────────────────────────────────────
        if not songs:
            await q.put(_sse_event("error", {"message": "Could not process any songs"}))
        else:
            combined = aggregate_fingerprints(fingerprints)
            combined_fp_b64 = encode_fingerprint_b64(combined.global_fingerprint)
            temporal_resampled = resample_sequence(combined.temporal_fingerprints)
            temporal_b64 = encode_temporal_b64(temporal_resampled)
            vibe = describe_vibe(combined.region_scores)

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

            n = len(songs)
            summary = f"Analyzed {n} song{'s' if n > 1 else ''}"
            if n > 1 and pairwise:
                avg_sim = sum(p.similarity for p in pairwise) / len(pairwise)
                summary += f" with average pairwise similarity of {avg_sim:.2f}"
            summary += f". {vibe}"

            analysis_id = f"analysis_{uuid.uuid4().hex[:12]}"

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
                summary=summary,
            )

            await q.put(_sse_event("complete", response.model_dump()))

    except Exception as exc:
        logger.exception("Batch %s failed", batch_id)
        await q.put(_sse_event("error", {"message": str(exc)}))

    finally:
        for p in audio_paths:
            cleanup_audio(p)
        batch["done"] = True
        # Sentinel: signals SSE reader that no more events will arrive
        await q.put(None)
        # Clean up batch entry after 5 minutes to avoid memory leak
        await asyncio.sleep(300)
        _batches.pop(batch_id, None)


@router.post("/analyze")
async def analyze_cluster(
    req: ClusterAnalyzeRequest,
    authorization: str | None = Header(None),
):
    """Submit songs for analysis. Returns immediately with a batch_id.

    Processing runs in the background — the HTTP connection closes
    right away. Listen for results on `GET /clusters/batch/{batch_id}/events`.

    ## Response

    ```json
    {"batch_id": "abc123", "total_songs": 12, "status": "processing"}
    ```
    """
    all_cluster_songs = await _resolve_songs(req)
    user_id = try_get_user_id(authorization)

    batch_id = uuid.uuid4().hex[:12]
    q: asyncio.Queue = asyncio.Queue()
    _batches[batch_id] = {"events": q, "done": False, "task": None}

    task = asyncio.create_task(_process_batch(batch_id, all_cluster_songs, user_id))
    _batches[batch_id]["task"] = task

    logger.info("Batch %s started: %d songs", batch_id, len(all_cluster_songs))

    return {
        "batch_id": batch_id,
        "total_songs": len(all_cluster_songs),
        "status": "processing",
    }


@router.get("/batch/{batch_id}/events")
async def batch_events(batch_id: str, request: Request):
    """SSE stream for a batch. Client opens this to receive pings as songs finish.

    ## SSE Events

    | Event | Data | When |
    |-------|------|------|
    | `song_complete` | `{song, index, total, cached}` | Song finished and cached to DB |
    | `song_error` | `{song, index, total, error}` | Song failed (skipped) |
    | `complete` | Full `ClusterAnalyzeResponse` JSON | All songs done |
    | `error` | `{message}` | Fatal error |

    ## Usage

    ```js
    // 1. Submit
    const { batch_id } = await fetch('/clusters/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotify_playlist_url: '...' }),
    }).then(r => r.json());

    // 2. Listen for pings
    const es = new EventSource(`/clusters/batch/${batch_id}/events`);
    es.addEventListener('song_complete', (e) => {
      console.log(JSON.parse(e.data));
    });
    es.addEventListener('complete', (e) => {
      console.log('Done!', JSON.parse(e.data));
      es.close();
    });
    ```
    """
    batch = _batches.get(batch_id)
    if not batch:
        raise HTTPException(404, f"Batch {batch_id} not found")

    q: asyncio.Queue = batch["events"]

    async def event_stream():
        if batch["done"] and q.empty():
            return
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=30.0)
            except asyncio.TimeoutError:
                if batch["done"] and q.empty():
                    return
                yield ": keepalive\n\n"
                continue

            if event is None:
                return
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
