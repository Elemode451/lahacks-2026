"""Cache TRIBE inference results in Supabase so repeat queries are instant.

Each song is keyed by its YouTube URL or spotify:<id>. The full compressed
predictions matrix is stored alongside region scores and metadata.
"""

from __future__ import annotations

import base64
import gzip
import io
import logging

import numpy as np

from app.services.tribe import SongFingerprints, derive_fingerprints

logger = logging.getLogger(__name__)


def _get_client():
    """Lazy import to avoid circular deps and allow graceful fallback."""
    try:
        from app.services.supabase_client import get_supabase
        return get_supabase()
    except Exception:
        logger.warning("Supabase not configured — caching disabled")
        return None


def _compress_preds(preds: np.ndarray) -> str:
    buf = io.BytesIO()
    np.save(buf, preds.astype(np.float32))
    return base64.b64encode(gzip.compress(buf.getvalue())).decode("ascii")


def _decompress_preds(b64gz: str) -> np.ndarray:
    raw = gzip.decompress(base64.b64decode(b64gz))
    return np.load(io.BytesIO(raw))


def make_lookup_key(
    youtube_url: str | None = None,
    spotify_id: str | None = None,
) -> str | None:
    """Build a cache lookup key from a YouTube URL or Spotify ID."""
    if spotify_id:
        return f"spotify:{spotify_id}"
    if youtube_url:
        return youtube_url
    return None


def get_cached(lookup_key: str) -> SongFingerprints | None:
    """Try to load cached fingerprints from Supabase. Returns None on miss."""
    client = _get_client()
    if client is None:
        return None

    try:
        resp = (
            client.table("song_cache")
            .select("preds_b64gz")
            .eq("lookup_key", lookup_key)
            .limit(1)
            .execute()
        )
        rows = resp.data
        if not rows:
            return None

        preds = _decompress_preds(rows[0]["preds_b64gz"])
        logger.info("Cache HIT for %s — shape %s", lookup_key, preds.shape)
        return derive_fingerprints(preds)

    except Exception:
        logger.exception("Cache lookup failed for %s", lookup_key)
        return None


def store_cached(
    lookup_key: str,
    preds: np.ndarray,
    title: str = "Unknown",
    artist: str = "Unknown",
    region_scores: dict | None = None,
    inference_time_s: float | None = None,
) -> None:
    """Store inference results in the Supabase cache."""
    client = _get_client()
    if client is None:
        return

    try:
        row = {
            "lookup_key": lookup_key,
            "title": title,
            "artist": artist,
            "preds_b64gz": _compress_preds(preds),
            "preds_shape": list(preds.shape),
            "region_scores": region_scores or {},
            "inference_time_s": inference_time_s,
        }
        client.table("song_cache").upsert(row, on_conflict="lookup_key").execute()
        logger.info("Cached results for %s — shape %s", lookup_key, preds.shape)

    except Exception:
        logger.exception("Failed to cache results for %s", lookup_key)
