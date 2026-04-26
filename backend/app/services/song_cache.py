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

from app.models.schemas import RegionScores
from app.services.tribe import (
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


def get_cached_lightweight(lookup_key: str) -> dict | None:
    """Fetch region_scores, title, and artist without decompressing fingerprints.

    Returns a dict with keys: title, artist, region_scores (RegionScores).
    Returns None if the song isn't cached.
    """
    client = _get_client()
    if client is None:
        return None

    try:
        resp = (
            client.table("song_cache")
            .select("title,artist,region_scores")
            .eq("lookup_key", lookup_key)
            .limit(1)
            .execute()
        )
        rows = resp.data
        if not rows:
            return None
        row = rows[0]
        rs = row.get("region_scores") or {}
        return {
            "title": row.get("title", "Unknown"),
            "artist": row.get("artist", "Unknown"),
            "region_scores": RegionScores(**rs),
        }
    except Exception:
        logger.exception("Lightweight cache lookup failed for %s", lookup_key)
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
    exclude_keys: set[str] | None = None,
    n: int = 10,
) -> tuple[list[dict], int]:
    """Find similar songs by cosine similarity on region scores.

    Fetches only the lightweight region_scores JSONB column (~100 bytes per
    row) from Supabase — no fingerprint blob decompression needed. Computes
    cosine similarity on the 6 region activation values.

    Args:
        exclude_keys: set of song keys to skip (e.g. already recommended).
        exclude_key: single key to skip (the target song itself).

    Returns (top_n_results, total_catalog_size).
    Each result dict has: lookup_key, title, artist, region_scores, similarity.
    """
    client = _get_client()
    if client is None:
        return [], 0

    skip = set(exclude_keys or ())
    if exclude_key:
        skip.add(exclude_key)

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
            if key in skip:
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


# ── Analysis persistence ────────────────────────────────────────────────────


def save_analysis(
    analysis_id: str,
    kind: str,
    title: str,
    payload: dict,
    owner_id: str | None = None,
) -> bool:
    """Persist an analysis result to the Supabase ``analyses`` table.

    If *owner_id* is ``None`` (unauthenticated), the analysis is still
    saved but won't appear in ``/me/analyses`` — it can only be
    retrieved by direct ID or via a share link.

    Returns ``True`` if the row was inserted successfully.
    """
    client = _get_client()
    if client is None:
        return False

    try:
        row = {
            "id": analysis_id,
            "kind": kind,
            "title": title,
            "payload": payload,
            "owner_id": owner_id,
        }
        client.table("analyses").insert(row).execute()
        logger.info("Saved analysis %s (kind=%s, owner=%s)", analysis_id, kind, owner_id)
        return True
    except Exception:
        logger.exception("Failed to save analysis %s", analysis_id)
        return False


# ── User interaction tracking (for collaborative filtering) ─────────────────


def record_user_interaction(user_id: str, song_key: str, interaction_type: str = "analyzed") -> None:
    """Record that a user interacted with a song (analyzed, saved, etc.)."""
    client = _get_client()
    if client is None:
        return
    try:
        client.table("user_song_interactions").upsert(
            {"user_id": user_id, "song_key": song_key, "interaction_type": interaction_type},
            on_conflict="user_id,song_key,interaction_type",
        ).execute()
    except Exception:
        logger.exception("Failed to record interaction for user %s", user_id)


def record_recommendations(user_id: str, recommendations: list[dict]) -> None:
    """Record which songs were recommended to a user (for de-duplication)."""
    client = _get_client()
    if client is None:
        return
    try:
        rows = [
            {
                "user_id": user_id,
                "song_key": r["lookup_key"],
                "source": r.get("source", "brain_similarity"),
                "similarity_score": r.get("similarity"),
            }
            for r in recommendations
        ]
        if rows:
            client.table("user_recommendations").insert(rows).execute()
    except Exception:
        logger.exception("Failed to record recommendations for user %s", user_id)


def get_previously_recommended(user_id: str) -> set[str]:
    """Get the set of song keys already recommended to this user."""
    client = _get_client()
    if client is None:
        return set()
    try:
        resp = (
            client.table("user_recommendations")
            .select("song_key")
            .eq("user_id", user_id)
            .execute()
        )
        return {row["song_key"] for row in (resp.data or [])}
    except Exception:
        logger.exception("Failed to fetch previous recommendations for user %s", user_id)
        return set()


def get_recommendation_history(user_id: str) -> list[dict]:
    """Get full recommendation history with metadata for this user."""
    client = _get_client()
    if client is None:
        return []
    try:
        resp = (
            client.table("user_recommendations")
            .select("song_key,source,similarity_score,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return []

        # Deduplicate by song_key (keep most recent)
        seen: set[str] = set()
        unique: list[dict] = []
        for row in rows:
            if row["song_key"] not in seen:
                seen.add(row["song_key"])
                unique.append(row)

        # Fetch metadata
        keys = [r["song_key"] for r in unique]
        meta_resp = (
            client.table("song_cache")
            .select("lookup_key,title,artist,region_scores")
            .in_("lookup_key", keys)
            .execute()
        )
        metadata = {r["lookup_key"]: r for r in (meta_resp.data or [])}

        results = []
        for row in unique:
            meta = metadata.get(row["song_key"])
            if meta:
                results.append({
                    "lookup_key": row["song_key"],
                    "title": meta.get("title", "Unknown"),
                    "artist": meta.get("artist", "Unknown"),
                    "source": row.get("source", "brain_similarity"),
                    "similarity": row.get("similarity_score", 0.0),
                })
        return results
    except Exception:
        logger.exception("Failed to fetch recommendation history for user %s", user_id)
        return []


def clear_recommendation_history(user_id: str) -> int:
    """Clear all recommendation history for this user. Returns count deleted."""
    client = _get_client()
    if client is None:
        return 0
    try:
        resp = (
            client.table("user_recommendations")
            .delete()
            .eq("user_id", user_id)
            .execute()
        )
        count = len(resp.data or [])
        logger.info("Cleared %d recommendations for user %s", count, user_id)
        return count
    except Exception:
        logger.exception("Failed to clear recommendation history for user %s", user_id)
        return 0


def find_collaborative_recommendations(
    user_id: str,
    exclude_keys: set[str] | None = None,
    n: int = 10,
) -> tuple[list[dict], int]:
    """'Users like you also like' — collaborative filtering.

    Finds users who analyzed the same songs as the current user,
    then surfaces songs those users analyzed that the current user hasn't.
    Returns (results, similar_user_count) sorted by frequency.
    """
    client = _get_client()
    if client is None:
        return [], 0

    skip = set(exclude_keys or ())

    try:
        # Step 1: Get songs the current user has analyzed
        resp = (
            client.table("user_song_interactions")
            .select("song_key")
            .eq("user_id", user_id)
            .execute()
        )
        my_songs = {row["song_key"] for row in (resp.data or [])}
        if not my_songs:
            return [], 0

        # Step 2: Find other users who analyzed at least one of the same songs
        resp = (
            client.table("user_song_interactions")
            .select("user_id,song_key")
            .in_("song_key", list(my_songs))
            .neq("user_id", user_id)
            .execute()
        )
        similar_user_ids = {row["user_id"] for row in (resp.data or [])}
        if not similar_user_ids:
            return [], 0

        # Step 3: Get all songs those similar users have analyzed
        resp = (
            client.table("user_song_interactions")
            .select("song_key")
            .in_("user_id", list(similar_user_ids))
            .execute()
        )

        # Count frequency — songs analyzed by more similar users rank higher
        from collections import Counter
        song_counts: Counter[str] = Counter()
        for row in (resp.data or []):
            key = row["song_key"]
            if key not in my_songs and key not in skip:
                song_counts[key] += 1

        if not song_counts:
            return [], len(similar_user_ids)

        # Step 4: Fetch metadata for the top songs
        top_keys = [k for k, _ in song_counts.most_common(n)]
        resp = (
            client.table("song_cache")
            .select("lookup_key,title,artist,region_scores")
            .in_("lookup_key", top_keys)
            .execute()
        )

        metadata = {row["lookup_key"]: row for row in (resp.data or [])}
        results = []
        for key in top_keys:
            meta = metadata.get(key)
            if meta:
                results.append({
                    "lookup_key": key,
                    "title": meta.get("title", "Unknown"),
                    "artist": meta.get("artist", "Unknown"),
                    "region_scores": meta.get("region_scores", {}),
                    "similarity": round(song_counts[key] / len(similar_user_ids), 4),
                    "source": "collaborative",
                    "collab_count": song_counts[key],
                })

        logger.info(
            "Collaborative recs for user %s: %d similar users, %d candidates",
            user_id, len(similar_user_ids), len(results),
        )
        return results, len(similar_user_ids)

    except Exception:
        logger.exception("Collaborative filtering failed for user %s", user_id)
        return [], 0
