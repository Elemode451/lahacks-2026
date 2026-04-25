"""Audio downloading and conversion using yt-dlp."""

from __future__ import annotations

import logging
import os
import uuid
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
