"""Audio downloading and conversion using yt-dlp."""

from __future__ import annotations

import logging
import os
import subprocess
import uuid

import httpx
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def _ensure_cache_dir() -> Path:
    p = Path(settings.audio_cache_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def download_youtube_audio(url: str) -> Path:
    """Download audio from a YouTube URL, convert to WAV, return the path."""
    import yt_dlp

    cache = _ensure_cache_dir()
    file_id = uuid.uuid4().hex[:12]
    output_template = str(cache / f"{file_id}.%(ext)s")
    wav_path = cache / f"{file_id}.wav"

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "192",
            }
        ],
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    if not wav_path.exists():
        # yt-dlp sometimes names the file differently
        candidates = list(cache.glob(f"{file_id}.*"))
        for c in candidates:
            if c.suffix == ".wav":
                wav_path = c
                break
        else:
            raise FileNotFoundError(
                f"Downloaded audio not found. Candidates: {candidates}"
            )

    logger.info("Downloaded YouTube audio to %s", wav_path)
    return wav_path


def download_spotify_preview(url: str) -> Path | None:
    try:
        cache = _ensure_cache_dir()
        file_id = uuid.uuid4().hex[:12]
        temp_mp3 = cache / f"{file_id}_temp.mp3"
        wav_path = cache / f"{file_id}.wav"

        with httpx.Client(timeout=10) as client:
            resp = client.get(url)
        if resp.status_code != 200:
            return None

        temp_mp3.write_bytes(resp.content)

        subprocess.run([
            "ffmpeg", "-y", "-i", str(temp_mp3),
            "-ar", "44100", "-ac", "1", str(wav_path)
        ], check=True, capture_output=True)

        temp_mp3.unlink()

        return wav_path
    except Exception as e:
        logger.warning("Spotify preview conversion failed: %s", e)
        return None


def get_audio_for_track(track: dict) -> Path:
    """
    1. Try Spotify preview
    2. Fallback to YouTube (sync wrapper)
    3. Fail only if both fail
    """
    import asyncio

    # Spotify
    preview_url = track.get("preview_url")

    if preview_url:
        logger.info("Trying Spotify preview...")
        path = download_spotify_preview(preview_url)

        if path:
            return path

        logger.info("Spotify failed, falling back to YouTube")

    # YouTube — search_youtube_for_track is async, so we need to run it
    from app.services.spotify import search_youtube_for_track

    youtube_url = asyncio.run(search_youtube_for_track(
        track.get("name", ""),
        track.get("artist", ""),
    ))

    if youtube_url:
        logger.info("Trying YouTube fallback...")
        return download_youtube_audio(youtube_url)

    raise RuntimeError("No audio source found (Spotify + YouTube failed)")


async def save_uploaded_audio(file_bytes: bytes, filename: str) -> Path:
    """Save an uploaded audio file to the cache directory. Returns the path."""
    cache = _ensure_cache_dir()
    file_id = uuid.uuid4().hex[:12]
    ext = Path(filename).suffix or ".wav"
    dest = cache / f"{file_id}{ext}"
    dest.write_bytes(file_bytes)
    logger.info("Saved uploaded audio to %s (%d bytes)", dest, len(file_bytes))
    return dest


def cleanup_audio(path: Path) -> None:
    """Remove a cached audio file."""
    try:
        if path.exists():
            os.remove(path)
    except OSError:
        logger.warning("Failed to clean up %s", path)
