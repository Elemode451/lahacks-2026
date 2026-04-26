"""Emotion mapping module for brain region activations.

Maps TRIBE v2 cortical region scores to emotions and psychological states
grounded in auditory neuroscience research.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.schemas import RegionScores


# ── Region → Emotion mapping ────────────────────────────────────────────────

@dataclass
class EmotionLabel:
    """A single emotion with intensity and description."""
    name: str
    intensity: float          # 0.0–1.0 relative intensity
    level: str                # "high", "medium", "low"
    description: str


@dataclass
class EmotionalProfile:
    """Complete emotional profile derived from region scores."""
    emotions: list[EmotionLabel] = field(default_factory=list)
    dominant_emotions: list[str] = field(default_factory=list)
    summary: str = ""

    def to_dict(self) -> dict:
        return {
            "emotions": [
                {
                    "name": e.name,
                    "intensity": round(e.intensity, 3),
                    "level": e.level,
                    "description": e.description,
                }
                for e in self.emotions
            ],
            "dominant_emotions": self.dominant_emotions,
            "summary": self.summary,
        }


# Each brain region maps to a set of emotions with descriptions at each
# activation tier.  The mapping is grounded in auditory-neuroscience
# literature on cortical responses to music.

REGION_EMOTION_MAP: dict[str, list[dict[str, str]]] = {
    "auditory": [
        {
            "name": "Rhythmic groove",
            "high": "Strong rhythmic pull that makes you want to move — the beat deeply engages the auditory cortex.",
            "medium": "A noticeable rhythmic drive that gives the track a steady, engaging pulse.",
            "low": "Subtle rhythmic elements in the background.",
        },
        {
            "name": "Musical chills",
            "high": "Intense auditory pleasure — the kind of sound textures that trigger goosebumps and physical shivers.",
            "medium": "Pleasing sonic textures that create moments of auditory satisfaction.",
            "low": "Mild auditory engagement with the sonic palette.",
        },
        {
            "name": "Auditory pleasure",
            "high": "Rich, rewarding sound design that deeply satisfies the ear.",
            "medium": "Pleasant sonic qualities that keep you listening.",
            "low": "Basic auditory engagement.",
        },
    ],
    "superior_temporal": [
        {
            "name": "Nostalgia",
            "high": "Powerful nostalgic resonance — melodies and harmonies that feel deeply familiar, evoking vivid memories.",
            "medium": "A warm sense of recognition, like hearing something that reminds you of another time.",
            "low": "Faint melodic familiarity.",
        },
        {
            "name": "Musical expectation",
            "high": "Strong melodic tension and resolution — the brain is actively predicting and being rewarded by harmonic movement.",
            "medium": "Moderate melodic engagement that keeps the listener's attention through tonal patterns.",
            "low": "Simple melodic content with minimal harmonic surprise.",
        },
        {
            "name": "Tonal processing",
            "high": "Deep tonal and harmonic processing — complex chord progressions and pitch relationships fully engage the superior temporal cortex.",
            "medium": "Active tonal awareness — the listener is tracking melody and harmony.",
            "low": "Minimal tonal complexity.",
        },
    ],
    "temporo_parietal": [
        {
            "name": "Awe",
            "high": "A sense of vastness and wonder — this music creates an expansive, transcendent soundscape.",
            "medium": "Moments of spatial beauty that open up the listening experience.",
            "low": "Limited spatial dimension.",
        },
        {
            "name": "Immersion",
            "high": "Deeply immersive — the brain's spatial processing creates an enveloping, almost out-of-body sonic experience.",
            "medium": "Noticeable spatial depth that draws you into the music.",
            "low": "Minimal spatial immersion.",
        },
        {
            "name": "Transcendence",
            "high": "Transcendent, almost otherworldly quality — the kind of sound that makes you lose sense of your surroundings.",
            "medium": "Hints of something greater — spatial cues that lift the music beyond the ordinary.",
            "low": "Grounded, straightforward presentation.",
        },
    ],
    "inferior_frontal": [
        {
            "name": "Anticipation",
            "high": "Powerful build-ups and tension — the brain is locked into expecting what comes next.",
            "medium": "Moderate tension-release dynamics that maintain forward momentum.",
            "low": "Minimal tension or build-up.",
        },
        {
            "name": "Surprise",
            "high": "Striking musical surprises — unexpected turns that jolt the listener's emotional response.",
            "medium": "Occasional unexpected elements that add interest.",
            "low": "Predictable musical structure.",
        },
        {
            "name": "Emotional regulation",
            "high": "Complex emotional processing — the frontal cortex is actively managing layered emotional responses to the music.",
            "medium": "Moderate emotional complexity that engages reflective processing.",
            "low": "Straightforward emotional content.",
        },
    ],
    "multisensory": [
        {
            "name": "Euphoria",
            "high": "Full-body euphoria — all senses converge into an overwhelming, blissful response.",
            "medium": "A warm, diffuse pleasure that spreads beyond just hearing.",
            "low": "Mild cross-modal engagement.",
        },
        {
            "name": "Synesthetic experience",
            "high": "Strong synesthetic quality — this music evokes vivid colors, textures, or physical sensations beyond sound.",
            "medium": "Some cross-sensory resonance — the music hints at colors or textures.",
            "low": "Primarily auditory experience.",
        },
        {
            "name": "Sensory overwhelm",
            "high": "Total sensory immersion — the brain integrates this music across multiple sensory pathways at once.",
            "medium": "Multi-layered sensory engagement that adds richness to the experience.",
            "low": "Contained sensory impact.",
        },
    ],
}

# Thresholds for classifying activation levels (relative scale 0–1)
HIGH_THRESHOLD = 0.7
MEDIUM_THRESHOLD = 0.4


def _classify_level(relative_score: float) -> str:
    """Classify a relative activation score into high/medium/low."""
    if relative_score > HIGH_THRESHOLD:
        return "high"
    if relative_score > MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def _normalize_scores(region_scores: RegionScores) -> dict[str, float]:
    """Normalize region scores to 0–1 relative scale."""
    scores = region_scores.model_dump()
    scores.pop("whole_cortex", None)

    values = list(scores.values())
    if not values:
        return {}

    max_val = max(values)
    if max_val == 0:
        return {k: 0.0 for k in scores}

    return {k: v / max_val for k, v in scores.items()}


def map_region_scores_to_emotions(region_scores: RegionScores) -> dict:
    """Map brain region scores to an emotional profile.

    Parameters
    ----------
    region_scores : RegionScores
        Per-region activation scores from TRIBE v2 analysis.

    Returns
    -------
    dict
        Structured dict with emotion labels, intensities, descriptions,
        dominant emotions, and a natural-language summary.
    """
    normalized = _normalize_scores(region_scores)
    all_emotions: list[EmotionLabel] = []

    for region, rel_score in normalized.items():
        level = _classify_level(rel_score)
        emotion_defs = REGION_EMOTION_MAP.get(region, [])

        for edef in emotion_defs:
            description = edef.get(level, "")
            if not description:
                continue
            all_emotions.append(EmotionLabel(
                name=edef["name"],
                intensity=rel_score,
                level=level,
                description=description,
            ))

    # Sort by intensity descending so dominant emotions come first
    all_emotions.sort(key=lambda e: e.intensity, reverse=True)

    # Identify dominant emotions (high-intensity ones)
    dominant = [
        e.name for e in all_emotions
        if e.level == "high"
    ]
    # If no high-level emotions, take top 2 medium ones
    if not dominant:
        dominant = [
            e.name for e in all_emotions
            if e.level == "medium"
        ][:2]

    summary = _build_emotional_summary(all_emotions, dominant, region_scores)

    profile = EmotionalProfile(
        emotions=all_emotions,
        dominant_emotions=dominant,
        summary=summary,
    )
    return profile.to_dict()


def _build_emotional_summary(
    emotions: list[EmotionLabel],
    dominant: list[str],
    region_scores: RegionScores,
) -> str:
    """Build a natural-language summary of the emotional profile."""
    if not emotions:
        return "This track has a balanced, neutral predicted emotional profile."

    overall = region_scores.whole_cortex

    # Intensity qualifier
    if overall >= 0.04:
        intensity = "intensely"
    elif overall >= 0.02:
        intensity = "noticeably"
    else:
        intensity = "gently"

    # Describe dominant emotions
    if not dominant:
        return f"This track {intensity} engages the brain with a balanced emotional profile across multiple dimensions."

    # Build readable list of dominant emotions
    unique_dominant = list(dict.fromkeys(dominant))  # preserve order, remove dupes
    if len(unique_dominant) == 1:
        emo_str = unique_dominant[0].lower()
    elif len(unique_dominant) == 2:
        emo_str = f"{unique_dominant[0].lower()} and {unique_dominant[1].lower()}"
    else:
        emo_str = (
            ", ".join(e.lower() for e in unique_dominant[:-1])
            + f", and {unique_dominant[-1].lower()}"
        )

    summary = f"This track is predicted to {intensity} evoke {emo_str}."

    # Add supporting detail from the top two high-intensity emotions
    high_emotions = [e for e in emotions if e.level == "high"]
    if len(high_emotions) >= 2:
        e1, e2 = high_emotions[0], high_emotions[1]
        summary += (
            f" The strong {e1.name.lower()} response is paired with "
            f"{e2.name.lower()}, creating a rich emotional landscape."
        )
    elif len(high_emotions) == 1:
        e1 = high_emotions[0]
        summary += f" The dominant {e1.name.lower()} response drives the emotional experience."

    return summary
