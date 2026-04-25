"""Cache TRIBE inference results in Supabase so repeat queries are instant.

Each song is keyed by its YouTube URL or spotify:<id>. Instead of storing
the full raw predictions matrix (which can exceed Supabase's statement
timeout for large songs), we store the derived fingerprints — the compact
representations actually used for comparison.
"""

from __future__ import annotations

import base64
import gzip
import io
import logging

import numpy as np

from app.models.schemas import RegionScores, SongInfo
from app.services.tribe import (
    N_VERTICES,
    TEMPORAL_RESAMPLE_N,
    SongFingerprints,
    resample_sequence,
)

logger = logging.getLogger(__name__)


def _get_client():
    """Lazy import to avoid circular deps and allow graceful fallback."""
    try:
        from app.services.supabase_client import get_supabase
        return get_supabase()
    except Exception:
        logger.warning("Supabase not configured — caching disabled")
        return None


def _compress_array(arr: np.ndarray) -> str:
    """Gzip + base64 encode a numpy array."""
    buf = io.BytesIO()
    np.save(buf, arr.astype(np.float32))
    return base64.b64encode(gzip.compress(buf.getvalue(), compresslevel=6)).decode("ascii")


def _decompress_array(b64gz: str) -> np.ndarray:
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
            .select("fingerprints_b64gz,region_scores,peak_index,fingerprint_id,timeline_scores")
            .eq("lookup_key", lookup_key)
            .limit(1)
            .execute()
        )
        rows = resp.data
        if not rows:
            return None

        row = rows[0]
        data = _decompress_array(row["fingerprints_b64gz"])

        # data layout: row 0 = global_fp, row 1 = peak_fp, rows 2..31 = temporal_fps
        global_fp = data[0]
        peak_fp = data[1]
        temporal_fps = [data[i] for i in range(2, 2 + TEMPORAL_RESAMPLE_N)]

        rs = row.get("region_scores") or {}
        region_scores = RegionScores(**rs)

        timeline = row.get("timeline_scores") or []

        fp = SongFingerprints(
            fingerprint_id=row.get("fingerprint_id", "fp_cached"),
            global_fingerprint=global_fp,
            temporal_fingerprints=temporal_fps,
            peak_fingerprint=peak_fp,
            peak_index=row.get("peak_index", 0),
            region_scores=region_scores,
            timeline_region_scores=timeline,
        )

        logger.info("Cache HIT for %s", lookup_key)
        return fp

    except Exception:
        logger.exception("Cache lookup failed for %s", lookup_key)
        return None


def store_cached(
    lookup_key: str,
    fingerprints: SongFingerprints,
    title: str = "Unknown",
    artist: str = "Unknown",
    inference_time_s: float | None = None,
) -> None:
    """Store derived fingerprints in the Supabase cache.

    We pack global_fp + peak_fp + 30 resampled temporal fps into a single
    (32, 20484) matrix, compress it (~500KB), and store that instead of the
    full raw predictions (~15MB+).
    """
    client = _get_client()
    if client is None:
        return

    try:
        # Resample temporal fingerprints to fixed length for storage
        temporal_resampled = resample_sequence(fingerprints.temporal_fingerprints)

        # Pack into (32, V) matrix: [global, peak, temporal_0..temporal_29]
        packed = np.stack(
            [fingerprints.global_fingerprint, fingerprints.peak_fingerprint]
            + temporal_resampled,
            axis=0,
        ).astype(np.float32)

        region_dict = fingerprints.region_scores.model_dump()

        # Timeline region scores — list of dicts, one per original segment
        timeline = fingerprints.timeline_region_scores or []

        row = {
            "lookup_key": lookup_key,
            "title": title,
            "artist": artist,
            "fingerprints_b64gz": _compress_array(packed),
            "preds_shape": list(packed.shape),
            "region_scores": region_dict,
            "timeline_scores": timeline,
            "peak_index": fingerprints.peak_index,
            "fingerprint_id": fingerprints.fingerprint_id,
            "inference_time_s": inference_time_s,
        }

        compressed_size = len(row["fingerprints_b64gz"]) / 1e6
        logger.info(
            "Caching %s — packed shape %s (%.2fMB compressed)",
            lookup_key, packed.shape, compressed_size,
        )

        client.table("song_cache").upsert(row, on_conflict="lookup_key").execute()
        logger.info("Cached results for %s", lookup_key)

    except Exception:
        logger.exception("Failed to cache results for %s", lookup_key)


_REGION_KEYS = [
    "auditory", "superior_temporal", "temporo_parietal",
    "inferior_frontal", "multisensory", "whole_cortex",
]


def find_similar_songs(
    target_scores: RegionScores,
    exclude_key: str | None = None,
    n: int = 10,
) -> tuple[list[dict], int]:
    """Find similar songs by cosine similarity on region scores.

    Fetches only the lightweight region_scores JSONB column (~100 bytes per
    row) from Supabase — no fingerprint blob decompression needed. Computes
    cosine similarity on the 6 region activation values.

    Returns (top_n_results, total_catalog_size).
    Each result dict has: lookup_key, title, artist, region_scores, similarity.
    """
    client = _get_client()
    if client is None:
        return [], 0

    try:
        resp = (
            client.table("song_cache")
            .select("lookup_key,title,artist,region_scores")
            .not_.is_("region_scores", "null")
            .execute()
        )
        rows = resp.data
        if not rows:
            return [], 0

        t = target_scores.model_dump()
        t_vec = [t[r] for r in _REGION_KEYS]
        t_mag = sum(v ** 2 for v in t_vec) ** 0.5
        if t_mag == 0:
            return [], len(rows)

        results: list[dict] = []
        for row in rows:
            key = row["lookup_key"]
            if key == exclude_key:
                continue

            rs = row.get("region_scores") or {}
            r_vec = [float(rs.get(r, 0.0)) for r in _REGION_KEYS]
            r_mag = sum(v ** 2 for v in r_vec) ** 0.5

            if r_mag == 0:
                continue

            dot = sum(a * b for a, b in zip(t_vec, r_vec))
            sim = dot / (t_mag * r_mag)

            results.append({
                "lookup_key": key,
                "title": row.get("title", "Unknown"),
                "artist": row.get("artist", "Unknown"),
                "region_scores": rs,
                "similarity": round(sim, 4),
            })

        results.sort(key=lambda x: x["similarity"], reverse=True)
        logger.info(
            "Recommendation query: %d candidates, returning top %d (best: %.4f)",
            len(results), min(n, len(results)),
            results[0]["similarity"] if results else 0.0,
        )
        return results[:n], len(rows)

    except Exception:
        logger.exception("Failed to find similar songs")
        return [], 0
