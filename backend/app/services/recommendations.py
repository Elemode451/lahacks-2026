"""Recommendation engine: similarity search using weighted multi-component scoring.

Final similarity = 0.50 * global + 0.30 * temporal_arc + 0.20 * peak
"""

from __future__ import annotations

import logging

import numpy as np

from app.models.schemas import (
    RegionDifference,
    SimilarityComponents,
    SongInfo,
    SongMatch,
)
from app.services.tribe import (
    REGION_VERTEX_RANGES,
    SongFingerprints,
    cosine_similarity,
    resample_sequence,
)

logger = logging.getLogger(__name__)

# Weights for the final similarity score
W_GLOBAL = 0.50
W_TEMPORAL = 0.30
W_PEAK = 0.20


def compare_songs(a: SongFingerprints, b: SongFingerprints) -> SimilarityComponents:
    """Compute the three similarity components between two songs."""
    global_sim = cosine_similarity(a.global_fingerprint, b.global_fingerprint)

    # Temporal arc: resample both to same length, compare aligned segments
    a_seq = resample_sequence(a.temporal_fingerprints)
    b_seq = resample_sequence(b.temporal_fingerprints)
    temporal_sims = [
        cosine_similarity(a_t, b_t) for a_t, b_t in zip(a_seq, b_seq)
    ]
    temporal_sim = float(np.mean(temporal_sims)) if temporal_sims else 0.0

    peak_sim = cosine_similarity(a.peak_fingerprint, b.peak_fingerprint)

    return SimilarityComponents(
        global_score=round(global_sim, 4),
        temporal_arc=round(temporal_sim, 4),
        peak=round(peak_sim, 4),
    )


def final_similarity(components: SimilarityComponents) -> float:
    """Compute weighted final similarity from components."""
    return round(
        W_GLOBAL * components.global_score
        + W_TEMPORAL * components.temporal_arc
        + W_PEAK * components.peak,
        4,
    )


def similarity_label(score: float) -> str:
    """Human-readable label for a similarity score."""
    if score >= 0.85:
        return "high"
    if score >= 0.70:
        return "moderate"
    return "low"


def region_comparison(
    a: SongFingerprints, b: SongFingerprints
) -> tuple[list[str], list[RegionDifference]]:
    """Compare region scores between two songs.

    Returns (matching_regions, largest_differences).
    """
    a_scores = a.region_scores.model_dump()
    b_scores = b.region_scores.model_dump()

    matching: list[str] = []
    diffs: list[RegionDifference] = []

    for region in REGION_VERTEX_RANGES:
        a_val = a_scores.get(region, 0.0)
        b_val = b_scores.get(region, 0.0)
        diff = abs(a_val - b_val)

        if diff < 0.10:
            matching.append(region)

        diffs.append(
            RegionDifference(
                region=region,
                left=round(a_val, 4),
                right=round(b_val, 4),
                difference=round(diff, 4),
            )
        )

    # Sort by largest difference
    diffs.sort(key=lambda d: d.difference, reverse=True)

    return matching, diffs[:3]


def find_top_matches(
    target: SongFingerprints,
    catalog: list[tuple[SongInfo, SongFingerprints]],
    n: int = 20,
    exclude_ids: set[str] | None = None,
) -> list[SongMatch]:
    """Find the top-N most similar songs from the catalog using weighted similarity."""
    if exclude_ids is None:
        exclude_ids = set()

    scored: list[tuple[float, SongInfo, SimilarityComponents, list[str]]] = []

    for song_info, song_fp in catalog:
        if song_info.song_id in exclude_ids:
            continue

        components = compare_songs(target, song_fp)
        score = final_similarity(components)
        matching, _ = region_comparison(target, song_fp)

        scored.append((score, song_info, components, matching))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        SongMatch(
            song=song_info,
            similarity_score=score,
            components=components,
            matching_regions=matching,
        )
        for score, song_info, components, matching in scored[:n]
    ]


def compute_cluster_coherence(
    fingerprints: list[SongFingerprints],
) -> tuple[float, str]:
    """Compute how coherent a set of fingerprints is using weighted similarity.

    Returns (coherence_score, coherence_label).
    """
    if len(fingerprints) < 2:
        return 1.0, "strong"

    scores: list[float] = []
    for i in range(len(fingerprints)):
        for j in range(i + 1, len(fingerprints)):
            components = compare_songs(fingerprints[i], fingerprints[j])
            scores.append(final_similarity(components))

    coherence = round(float(np.mean(scores)), 4)

    if coherence >= 0.85:
        label = "strong"
    elif coherence >= 0.70:
        label = "moderate"
    else:
        label = "eclectic"

    return coherence, label


def find_odd_one_out(
    songs: list[SongInfo],
    fingerprints: list[SongFingerprints],
) -> SongInfo | None:
    """Find the song most dissimilar from the rest using weighted similarity."""
    if len(fingerprints) < 3:
        return None

    avg_scores: list[float] = []
    for i in range(len(fingerprints)):
        sims = []
        for j in range(len(fingerprints)):
            if i != j:
                components = compare_songs(fingerprints[i], fingerprints[j])
                sims.append(final_similarity(components))
        avg_scores.append(float(np.mean(sims)))

    min_idx = int(np.argmin(avg_scores))

    if avg_scores[min_idx] < np.mean(avg_scores) - 0.1:
        return songs[min_idx]

    return None
