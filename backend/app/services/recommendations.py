"""Recommendation engine: similarity search over stored fingerprints."""

from __future__ import annotations

import logging

import numpy as np

from app.models.schemas import SongInfo, SongMatch
from app.services.tribe import cosine_similarity, REGION_VERTEX_RANGES

logger = logging.getLogger(__name__)


def find_top_matches(
    target: np.ndarray,
    catalog: list[tuple[SongInfo, np.ndarray]],
    n: int = 20,
    exclude_ids: set[str] | None = None,
) -> list[SongMatch]:
    """Find the top-N most similar songs from the catalog.

    Parameters
    ----------
    target : np.ndarray
        The target fingerprint vector (20484-dim).
    catalog : list of (SongInfo, fingerprint) tuples
        The song catalog to search.
    n : int
        Number of results to return.
    exclude_ids : set of str, optional
        Song IDs to exclude from results.

    Returns
    -------
    list of SongMatch
    """
    if exclude_ids is None:
        exclude_ids = set()

    scored: list[tuple[float, SongInfo, list[str]]] = []

    for song_info, fingerprint in catalog:
        if song_info.song_id in exclude_ids:
            continue

        sim = cosine_similarity(target, fingerprint)

        # Find which regions match best
        matching_regions: list[str] = []
        for region, (start, end) in REGION_VERTEX_RANGES.items():
            region_sim = cosine_similarity(target[start:end], fingerprint[start:end])
            if region_sim > 0.7:
                matching_regions.append(region)

        scored.append((sim, song_info, matching_regions))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        SongMatch(
            song=song_info,
            similarity_score=round(sim, 4),
            matching_regions=matching_regions,
        )
        for sim, song_info, matching_regions in scored[:n]
    ]


def compute_cluster_coherence(
    fingerprints: list[np.ndarray],
) -> tuple[float, str]:
    """Compute how coherent a set of fingerprints is.

    Returns (coherence_score, coherence_label).
    """
    if len(fingerprints) < 2:
        return 1.0, "strong"

    similarities: list[float] = []
    for i in range(len(fingerprints)):
        for j in range(i + 1, len(fingerprints)):
            similarities.append(cosine_similarity(fingerprints[i], fingerprints[j]))

    coherence = float(np.mean(similarities))

    if coherence >= 0.85:
        label = "strong"
    elif coherence >= 0.70:
        label = "moderate"
    else:
        label = "eclectic"

    return round(coherence, 4), label


def find_odd_one_out(
    songs: list[SongInfo],
    fingerprints: list[np.ndarray],
) -> SongInfo | None:
    """Find the song that is most dissimilar from the rest of the cluster.

    Returns None if the cluster is very coherent (all above 0.8).
    """
    if len(fingerprints) < 3:
        return None

    avg_sims: list[float] = []
    for i in range(len(fingerprints)):
        sims = []
        for j in range(len(fingerprints)):
            if i != j:
                sims.append(cosine_similarity(fingerprints[i], fingerprints[j]))
        avg_sims.append(float(np.mean(sims)))

    min_idx = int(np.argmin(avg_sims))

    # Only flag as odd-one-out if it's notably lower than the rest
    if avg_sims[min_idx] < np.mean(avg_sims) - 0.1:
        return songs[min_idx]

    return None
