"""TRIBE v2 inference service.

When `settings.use_mock_tribe` is True (default), returns mock fingerprints
so the frontend can develop without a GPU worker running.

When False, calls the TRIBE inference worker API.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

import numpy as np

from app.config import settings
from app.models.schemas import RegionScores

logger = logging.getLogger(__name__)

# Number of cortical vertices on fsaverage5 (both hemispheres)
N_VERTICES = 20484

# HCP region-to-vertex index ranges (approximate, for demo scoring)
# In production these come from the HCP parcellation atlas
REGION_VERTEX_RANGES: dict[str, tuple[int, int]] = {
    "auditory": (3000, 4500),           # A1, A4, A5 parcels
    "superior_temporal": (4500, 6500),   # STSda, STSdp, STSva, STSvp
    "temporo_parietal": (6500, 8000),    # PFm, PGi, TPOj
    "inferior_frontal": (8000, 9200),    # IFJa, IFJp, area 44, area 45
    "multisensory": (9200, 10242),       # misc association areas
}


def _region_scores_from_fingerprint(fingerprint: np.ndarray) -> RegionScores:
    """Compute per-region mean activation from a cortical fingerprint."""
    scores: dict[str, float] = {}
    for region, (start, end) in REGION_VERTEX_RANGES.items():
        scores[region] = float(np.mean(np.abs(fingerprint[start:end])))
    scores["whole_cortex"] = float(np.mean(np.abs(fingerprint)))
    return RegionScores(**scores)


def _mock_fingerprint(seed: str | None = None) -> np.ndarray:
    """Generate a deterministic mock fingerprint for development."""
    if seed:
        rng = np.random.RandomState(hash(seed) % (2**31))
    else:
        rng = np.random.RandomState()

    base = rng.randn(N_VERTICES).astype(np.float32) * 0.02
    # Add some structure: boost auditory + temporal regions
    base[3000:6500] += rng.uniform(0.02, 0.08)
    return base


async def get_fingerprint(
    audio_path: Path, song_id: str | None = None
) -> tuple[str, np.ndarray, RegionScores]:
    """Get a cortical fingerprint for an audio file.

    Returns (fingerprint_id, fingerprint_vector, region_scores).
    """
    fingerprint_id = f"fp_{uuid.uuid4().hex[:12]}"

    if settings.use_mock_tribe:
        logger.info("Using MOCK TRIBE fingerprint for %s", audio_path)
        fp = _mock_fingerprint(seed=str(audio_path))
        region_scores = _region_scores_from_fingerprint(fp)
        return fingerprint_id, fp, region_scores

    # Real TRIBE worker call
    import httpx

    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(audio_path, "rb") as f:
            resp = await client.post(
                f"{settings.tribe_worker_url}/fingerprint",
                files={"audio": (audio_path.name, f, "audio/wav")},
            )
            resp.raise_for_status()
            data = resp.json()

    fp = np.array(data["fingerprint"], dtype=np.float32)
    region_scores = _region_scores_from_fingerprint(fp)
    return fingerprint_id, fp, region_scores


async def get_temporal_frames(
    audio_path: Path,
) -> list[np.ndarray]:
    """Get per-segment cortical predictions (for the scrubber).

    Returns a list of fingerprint vectors, one per time segment.
    """
    if settings.use_mock_tribe:
        # Mock: generate ~10 frames for a 30-second clip
        n_frames = 10
        frames = []
        for i in range(n_frames):
            fp = _mock_fingerprint(seed=f"{audio_path}_{i}")
            # Add temporal variation
            fp += np.sin(np.linspace(0, np.pi * (i + 1), N_VERTICES)) * 0.01
            frames.append(fp)
        return frames

    import httpx

    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(audio_path, "rb") as f:
            resp = await client.post(
                f"{settings.tribe_worker_url}/temporal",
                files={"audio": (audio_path.name, f, "audio/wav")},
            )
            resp.raise_for_status()
            data = resp.json()

    return [np.array(frame, dtype=np.float32) for frame in data["frames"]]


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
