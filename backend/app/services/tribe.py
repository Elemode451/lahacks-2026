"""TRIBE v2 inference service.

When `settings.use_mock_tribe` is True (default), returns mock fingerprints
so the frontend can develop without a GPU worker running.

When False, calls the TRIBE inference worker API.
"""

from __future__ import annotations

import asyncio
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


_POLL_INTERVAL_S = 5       # seconds between /status polls
_POLL_TIMEOUT_S = 600      # max wait for a single job
_SUBMIT_RETRIES = 3        # retry /submit on transient errors

# In-flight background tasks keyed by cache_key so polling survives
# client disconnects.  Each value is an asyncio.Task whose result is
# SongFingerprints (or raises on failure).
_inflight: dict[str, asyncio.Task] = {}


async def _submit_and_poll(audio_path: Path) -> dict:
    """Submit audio to the async worker, poll /status until done.

    Uses POST /submit (returns immediately) + GET /status/{job_id}
    to avoid Cloudflare's 100-second proxy timeout on free tunnels.
    """
    import httpx

    worker = settings.tribe_worker_url

    # ── Submit ──────────────────────────────────────────────────────────
    last_err: Exception | None = None
    for attempt in range(1, _SUBMIT_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                with open(audio_path, "rb") as f:
                    resp = await client.post(
                        f"{worker}/submit",
                        files={"audio": (audio_path.name, f, "audio/wav")},
                    )

                resp.raise_for_status()
                job_id = resp.json()["job_id"]
                logger.info("Job submitted: %s (attempt %d)", job_id, attempt)
                break
        except httpx.HTTPStatusError as exc:
            last_err = exc
            if exc.response.status_code in (502, 503, 524):
                logger.warning("Submit attempt %d failed (%s), retrying...", attempt, exc.response.status_code)
                await asyncio.sleep(2 * attempt)
                continue
            raise
        except (httpx.ConnectError, httpx.ReadTimeout) as exc:
            last_err = exc
            logger.warning("Submit attempt %d failed (%s), retrying...", attempt, type(exc).__name__)
            await asyncio.sleep(2 * attempt)
            continue
    else:
        raise RuntimeError(f"Failed to submit job after {_SUBMIT_RETRIES} attempts: {last_err}")

    # ── Poll ────────────────────────────────────────────────────────────
    deadline = asyncio.get_event_loop().time() + _POLL_TIMEOUT_S
    while asyncio.get_event_loop().time() < deadline:
        await asyncio.sleep(_POLL_INTERVAL_S)
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.get(f"{worker}/status/{job_id}")
                resp.raise_for_status()
                data = resp.json()

            status = data.get("status")
            if status == "completed":
                logger.info("Job %s completed", job_id)
                return data["result"]
            elif status == "failed":
                raise RuntimeError(f"Worker inference failed: {data.get('error')}")
            else:
                pos = data.get("queue_position", "?")
                logger.debug("Job %s status=%s queue_pos=%s", job_id, status, pos)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (502, 503, 524):
                logger.warning("Poll error for job %s: %s", job_id, exc)
            else:
                raise
        except (httpx.ConnectError, httpx.ReadTimeout) as exc:
            # Transient network error during poll — keep trying
            logger.warning("Poll error for job %s: %s", job_id, exc)

    raise TimeoutError(f"Job {job_id} did not complete within {_POLL_TIMEOUT_S}s")


async def _do_inference(
    audio_path: Path,
    *,
    cache_key: str | None = None,
    title: str = "Unknown",
    artist: str = "Unknown",
) -> SongFingerprints:
    """Submit to worker, poll, derive fingerprints, and cache.

    Runs as an independent background task so it survives client disconnects.
    """
    from app.services.song_cache import store_cached

    data = await _submit_and_poll(audio_path)

    if "preds_b64gz" in data:
        compressed = base64.b64decode(data["preds_b64gz"])
        raw = gzip.decompress(compressed)
        preds = np.load(io.BytesIO(raw)).astype(np.float32)
    else:
        preds = np.array(data["preds"], dtype=np.float32)

    logger.info("Received preds %s from worker", preds.shape)

    fingerprints = derive_fingerprints(preds)

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
    In real mode, submits to the async worker queue via POST /submit and
    polls GET /status/{job_id} for results (avoids Cloudflare tunnel timeouts).

    The polling task is shielded from cancellation — if the HTTP client
    disconnects, the backend continues polling and caches the result so
    no GPU work is wasted.
    """
    if settings.use_mock_tribe:
        logger.info("Using MOCK TRIBE analysis for %s", audio_path)
        preds = _mock_preds(seed=str(audio_path))
        return derive_fingerprints(preds)

    # If this cache_key already has an in-flight task, await it instead
    # of submitting a duplicate job.
    if cache_key and cache_key in _inflight:
        logger.info("Joining existing in-flight task for %s", cache_key)
        return await asyncio.shield(_inflight[cache_key])

    # Spawn as a background task and shield it from cancellation so it
    # keeps running even if the SSE client disconnects.
    task = asyncio.create_task(
        _do_inference(
            audio_path,
            cache_key=cache_key,
            title=title,
            artist=artist,
        )
    )

    if cache_key:
        _inflight[cache_key] = task
        task.add_done_callback(lambda _: _inflight.pop(cache_key, None))

    return await asyncio.shield(task)


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


def _resample_raw(
    sequence: list[np.ndarray], n: int = TEMPORAL_RESAMPLE_N
) -> list[np.ndarray]:
    """Resample vectors via linear interpolation WITHOUT normalizing."""
    if len(sequence) == 0:
        return [np.zeros(N_VERTICES, dtype=np.float32)] * n
    if len(sequence) == n:
        return list(sequence)

    src_len = len(sequence)
    result = []
    for i in range(n):
        pos = i * (src_len - 1) / (n - 1) if n > 1 else 0
        lo = int(pos)
        hi = min(lo + 1, src_len - 1)
        frac = pos - lo
        interpolated = (1 - frac) * sequence[lo] + frac * sequence[hi]
        result.append(interpolated)
    return result


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


# ── Aggregation ─────────────────────────────────────────────────────────────


def aggregate_fingerprints(
    fps: list[SongFingerprints],
) -> SongFingerprints:
    """Combine multiple songs into one aggregate brain fingerprint.

    Averages the global fingerprints, resampled temporal fingerprints,
    and peak fingerprints across all songs to produce a single
    representation of the playlist's collective brain response.
    """
    if len(fps) == 1:
        fp = fps[0]
        # Resample temporal fingerprints so peak_index is in 0–29 space
        resampled = resample_sequence(fp.temporal_fingerprints)
        # Compute peak from raw (un-normalized) interpolated vectors
        raw_resampled = _resample_raw(fp.temporal_fingerprints)
        peak_norms = [float(np.linalg.norm(raw_resampled[t])) for t in range(TEMPORAL_RESAMPLE_N)]
        peak_idx = int(np.argmax(peak_norms))
        # Resample timeline to 30 segments to match temporal fingerprints
        resampled_timeline = _average_timelines([fp.timeline_region_scores])
        return SongFingerprints(
            fingerprint_id=fp.fingerprint_id,
            global_fingerprint=fp.global_fingerprint,
            temporal_fingerprints=resampled,
            peak_fingerprint=resampled[peak_idx],
            peak_index=peak_idx,
            region_scores=fp.region_scores,
            timeline_region_scores=resampled_timeline,
        )

    # Average global fingerprints
    global_fp = _normalize(
        np.mean([fp.global_fingerprint for fp in fps], axis=0)
    )

    # Average resampled temporal fingerprints (aligned to same length)
    resampled_all = [resample_sequence(fp.temporal_fingerprints) for fp in fps]
    avg_temporal = []
    for t in range(TEMPORAL_RESAMPLE_N):
        avg_vec = np.mean([r[t] for r in resampled_all], axis=0)
        avg_temporal.append(_normalize(avg_vec))

    # Peak: find which resampled segment has highest activation norm
    # Use raw (un-normalized) averaged vectors so norms reflect true activation
    raw_resampled_all = [_resample_raw(fp.temporal_fingerprints) for fp in fps]
    avg_raw = []
    for t in range(TEMPORAL_RESAMPLE_N):
        avg_raw.append(np.mean([r[t] for r in raw_resampled_all], axis=0))
    peak_norms = [float(np.linalg.norm(avg_raw[t])) for t in range(TEMPORAL_RESAMPLE_N)]
    peak_idx = int(np.argmax(peak_norms))
    peak_fp = avg_temporal[peak_idx]

    # Average per-song region scores directly (they were computed from raw data)
    region_fields = ["auditory", "superior_temporal", "temporo_parietal",
                     "inferior_frontal", "multisensory", "whole_cortex"]
    avg_scores: dict[str, float] = {}
    for field in region_fields:
        avg_scores[field] = float(np.mean([getattr(fp.region_scores, field) for fp in fps]))
    region_scores = RegionScores(**avg_scores)

    # Timeline: average region scores across songs, resample to 30 segments
    combined_timeline = _average_timelines([fp.timeline_region_scores for fp in fps])

    return SongFingerprints(
        fingerprint_id=f"fp_agg_{uuid.uuid4().hex[:8]}",
        global_fingerprint=global_fp,
        temporal_fingerprints=avg_temporal,
        peak_fingerprint=peak_fp,
        peak_index=peak_idx,
        region_scores=region_scores,
        timeline_region_scores=combined_timeline,
    )


def _average_timelines(
    timelines: list[list[dict[str, float]]],
) -> list[dict[str, float]]:
    """Average multiple per-segment region score timelines.

    Each timeline may have a different length; resample all to
    TEMPORAL_RESAMPLE_N before averaging.
    """
    if not timelines or all(len(t) == 0 for t in timelines):
        return []

    regions = ["auditory", "superior_temporal", "temporo_parietal",
               "inferior_frontal", "multisensory", "whole_cortex"]

    # Resample each timeline to TEMPORAL_RESAMPLE_N segments
    resampled: list[list[dict[str, float]]] = []
    for tl in timelines:
        if not tl:
            continue
        n_src = len(tl)
        resampled_tl: list[dict[str, float]] = []
        for i in range(TEMPORAL_RESAMPLE_N):
            pos = i * (n_src - 1) / (TEMPORAL_RESAMPLE_N - 1) if TEMPORAL_RESAMPLE_N > 1 else 0
            lo = int(pos)
            hi = min(lo + 1, n_src - 1)
            frac = pos - lo
            seg: dict[str, float] = {}
            for r in regions:
                v_lo = tl[lo].get(r, 0.0)
                v_hi = tl[hi].get(r, 0.0)
                seg[r] = round((1 - frac) * v_lo + frac * v_hi, 4)
            resampled_tl.append(seg)
        resampled.append(resampled_tl)

    if not resampled:
        return []

    # Average across songs
    result: list[dict[str, float]] = []
    for t in range(TEMPORAL_RESAMPLE_N):
        seg: dict[str, float] = {}
        for r in regions:
            vals = [rl[t].get(r, 0.0) for rl in resampled]
            seg[r] = round(float(np.mean(vals)), 4)
        result.append(seg)

    return result


def encode_fingerprint_b64(fp: np.ndarray) -> str:
    """Encode a numpy array as base64 (raw float32 bytes)."""
    return base64.b64encode(fp.astype(np.float32).tobytes()).decode("ascii")


def encode_temporal_b64(temporal_fps: list[np.ndarray]) -> str:
    """Encode a list of temporal fingerprint vectors as base64 (packed float32)."""
    packed = np.stack(temporal_fps, axis=0).astype(np.float32)
    return base64.b64encode(packed.tobytes()).decode("ascii")


# ── Vibe Description ────────────────────────────────────────────────────────

# Maps region activation to human-readable interpretations
_REGION_DESCRIPTIONS: dict[str, dict[str, str]] = {
    "auditory": {
        "high": "intense auditory cortex activation, suggesting strong sensitivity to sound texture and timbre",
        "moderate": "moderate auditory cortex engagement with the sonic landscape",
        "low": "minimal raw auditory cortex response",
    },
    "superior_temporal": {
        "high": "strong superior temporal activation, indicating deep melodic and harmonic processing",
        "moderate": "moderate temporal engagement with melody and rhythm patterns",
        "low": "low temporal processing of melodic content",
    },
    "temporo_parietal": {
        "high": "significant temporo-parietal activity, suggesting spatial audio processing and immersive soundstage",
        "moderate": "moderate spatial audio engagement",
        "low": "minimal spatial processing",
    },
    "inferior_frontal": {
        "high": "elevated inferior frontal activation, indicating strong syntactic/structural music processing",
        "moderate": "moderate frontal engagement with musical structure",
        "low": "low frontal processing of musical syntax",
    },
    "multisensory": {
        "high": "high multisensory integration, suggesting a deeply immersive cross-modal experience",
        "moderate": "moderate multisensory integration",
        "low": "limited multisensory integration",
    },
}


def describe_vibe(region_scores: RegionScores) -> str:
    """Generate a human-readable vibe description from region activation scores."""
    scores = region_scores.model_dump()
    del scores["whole_cortex"]

    # Rank regions by activation
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # Classify each region
    def _level(val: float) -> str:
        if val >= 0.04:
            return "high"
        if val >= 0.02:
            return "moderate"
        return "low"

    top_regions = ranked[:2]
    descriptions = []
    for region, val in top_regions:
        level = _level(val)
        desc = _REGION_DESCRIPTIONS.get(region, {}).get(level, "")
        if desc:
            descriptions.append(desc)

    if not descriptions:
        return "The predicted cortical response is relatively uniform across brain regions."

    overall_intensity = region_scores.whole_cortex
    if overall_intensity >= 0.04:
        intensity_word = "powerfully"
    elif overall_intensity >= 0.02:
        intensity_word = "noticeably"
    else:
        intensity_word = "subtly"

    vibe = f"This music {intensity_word} engages the brain, with {descriptions[0]}"
    if len(descriptions) > 1:
        vibe += f", paired with {descriptions[1]}"
    vibe += "."

    return vibe
