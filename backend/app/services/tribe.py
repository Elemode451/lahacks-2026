"""TRIBE v2 inference service.

When `settings.use_mock_tribe` is True (default), returns mock fingerprints
so the frontend can develop without a GPU worker running.

When False, calls the TRIBE inference worker API.
"""

from __future__ import annotations

import base64
import gzip
import io
import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from app.config import settings
from app.models.schemas import RegionScores

logger = logging.getLogger(__name__)

# Number of cortical vertices on fsaverage5 (both hemispheres)
N_VERTICES = 20484

# Number of segments to resample temporal fingerprints to for comparison
TEMPORAL_RESAMPLE_N = 30

# HCP region-to-vertex index ranges (approximate, for demo scoring)
REGION_VERTEX_RANGES: dict[str, tuple[int, int]] = {
    "auditory": (3000, 4500),
    "superior_temporal": (4500, 6500),
    "temporo_parietal": (6500, 8000),
    "inferior_frontal": (8000, 9200),
    "multisensory": (9200, 10242),
}


@dataclass
class SongFingerprints:
    """All fingerprint representations derived from TRIBE output for one song."""

    fingerprint_id: str
    global_fingerprint: np.ndarray          # (V,) normalized mean over time
    temporal_fingerprints: list[np.ndarray]  # list of (V,) normalized per-segment
    peak_fingerprint: np.ndarray            # (V,) normalized vector at max-norm timestep
    peak_index: int = 0                     # which segment is the peak
    region_scores: RegionScores = field(default_factory=RegionScores)
    timeline_region_scores: list[dict[str, float]] = field(default_factory=list)


def _normalize(v: np.ndarray) -> np.ndarray:
    """L2-normalize a vector. Returns zero vector if norm is 0."""
    n = np.linalg.norm(v)
    if n == 0:
        return v
    return v / n


def region_scores_from_fingerprint(fingerprint: np.ndarray) -> RegionScores:
    """Compute per-region mean activation from a cortical fingerprint."""
    scores: dict[str, float] = {}
    for region, (start, end) in REGION_VERTEX_RANGES.items():
        scores[region] = float(np.mean(np.abs(fingerprint[start:end])))
    scores["whole_cortex"] = float(np.mean(np.abs(fingerprint)))
    return RegionScores(**scores)


def _region_scores_dict(fingerprint: np.ndarray) -> dict[str, float]:
    """Region scores as a plain dict (for timeline entries)."""
    scores: dict[str, float] = {}
    for region, (start, end) in REGION_VERTEX_RANGES.items():
        scores[region] = round(float(np.mean(np.abs(fingerprint[start:end]))), 4)
    scores["whole_cortex"] = round(float(np.mean(np.abs(fingerprint))), 4)
    return scores


def _mock_preds(seed: str | None = None, n_segments: int = 20) -> np.ndarray:
    """Generate a mock TRIBE preds matrix (T, V) for development."""
    if seed:
        rng = np.random.RandomState(hash(seed) % (2**31))
    else:
        rng = np.random.RandomState()

    preds = rng.randn(n_segments, N_VERTICES).astype(np.float32) * 0.02
    # Add structure: auditory + temporal regions are stronger
    preds[:, 3000:6500] += rng.uniform(0.02, 0.08, size=(n_segments, 3500))
    # Add temporal variation: a "peak" around segment n_segments//2
    peak_seg = n_segments // 2
    for t in range(n_segments):
        intensity = 1.0 + 0.5 * np.exp(-0.5 * ((t - peak_seg) / 3) ** 2)
        preds[t] *= intensity
    return preds


def derive_fingerprints(preds: np.ndarray) -> SongFingerprints:
    """Derive all fingerprint representations from a TRIBE preds matrix.

    Parameters
    ----------
    preds : np.ndarray of shape (T, V)
        Raw TRIBE predictions, one row per time segment.

    Returns
    -------
    SongFingerprints with global, temporal, and peak fingerprints.
    """
    fingerprint_id = f"fp_{uuid.uuid4().hex[:12]}"

    # Global fingerprint: normalized mean over time
    global_fp = _normalize(preds.mean(axis=0))

    # Temporal fingerprints: normalized per-segment
    temporal_fps = [_normalize(preds[t]) for t in range(preds.shape[0])]

    # Peak fingerprint: segment with highest activation norm
    norms = [np.linalg.norm(preds[t]) for t in range(preds.shape[0])]
    peak_idx = int(np.argmax(norms))
    peak_fp = _normalize(preds[peak_idx])

    # Region scores (from un-normalized global mean)
    global_raw = preds.mean(axis=0)
    region_scores = region_scores_from_fingerprint(global_raw)

    # Timeline region scores (per segment)
    timeline = [_region_scores_dict(preds[t]) for t in range(preds.shape[0])]

    return SongFingerprints(
        fingerprint_id=fingerprint_id,
        global_fingerprint=global_fp,
        temporal_fingerprints=temporal_fps,
        peak_fingerprint=peak_fp,
        peak_index=peak_idx,
        region_scores=region_scores,
        timeline_region_scores=timeline,
    )


async def analyze_audio(
    audio_path: Path,
    *,
    cache_key: str | None = None,
    title: str = "Unknown",
    artist: str = "Unknown",
) -> SongFingerprints:
    """Run TRIBE v2 on an audio file and return all fingerprint representations.

    If *cache_key* is provided, the result is stored in the Supabase cache
    after successful inference.  Callers are responsible for checking the
    cache before calling this function.

    In mock mode, generates structured fake data.
    In real mode, calls the TRIBE inference worker.
    """
    import asyncio

    from app.services.song_cache import store_cached

    if settings.use_mock_tribe:
        logger.info("Using MOCK TRIBE analysis for %s", audio_path)
        preds = _mock_preds(seed=str(audio_path))
        return derive_fingerprints(preds)

    # Real TRIBE worker call
    import httpx

    async with httpx.AsyncClient(timeout=600.0) as client:
        with open(audio_path, "rb") as f:
            resp = await client.post(
                f"{settings.tribe_worker_url}/analyze",
                files={"audio": (audio_path.name, f, "audio/wav")},
            )
            resp.raise_for_status()
            data = resp.json()

    if "preds_b64gz" in data:
        compressed = base64.b64decode(data["preds_b64gz"])
        raw = gzip.decompress(compressed)
        preds = np.load(io.BytesIO(raw))
    else:
        preds = np.array(data["preds"], dtype=np.float32)

    logger.info("Received preds %s from worker", preds.shape)

    fingerprints = derive_fingerprints(preds)

    # Store in cache for next time (offload to thread to avoid blocking)
    if cache_key:
        await asyncio.to_thread(
            store_cached,
            cache_key,
            fingerprints,
            title=title,
            artist=artist,
            inference_time_s=data.get("inference_time_s"),
        )

    return fingerprints


def resample_sequence(
    sequence: list[np.ndarray], n: int = TEMPORAL_RESAMPLE_N
) -> list[np.ndarray]:
    """Resample a list of vectors to exactly *n* vectors via linear interpolation."""
    if len(sequence) == 0:
        return [np.zeros(N_VERTICES, dtype=np.float32)] * n
    if len(sequence) == n:
        return sequence

    src_len = len(sequence)
    result = []
    for i in range(n):
        pos = i * (src_len - 1) / (n - 1) if n > 1 else 0
        lo = int(pos)
        hi = min(lo + 1, src_len - 1)
        frac = pos - lo
        interpolated = (1 - frac) * sequence[lo] + frac * sequence[hi]
        result.append(_normalize(interpolated))
    return result


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
