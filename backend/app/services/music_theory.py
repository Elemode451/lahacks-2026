"""Music theory utilities — key naming, Circle of Fifths distance, mood associations."""

from __future__ import annotations

# ── Key name mapping (pitch-class → name) ───────────────────────────────────

PITCH_CLASS_NAMES: list[str] = [
    "C", "C#/Db", "D", "D#/Eb", "E", "F",
    "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
]

# Sharps-only names (used when a single canonical spelling is needed)
PITCH_CLASS_SHARP: list[str] = [
    "C", "C#", "D", "D#", "E", "F",
    "F#", "G", "G#", "A", "A#", "B",
]


def key_name(key: int, mode: int) -> str:
    """Return a human-readable key string, e.g. ``'C Major'`` or ``'F# Minor'``."""
    if not (0 <= key <= 11):
        return "Unknown"
    quality = "Major" if mode == 1 else "Minor"
    return f"{PITCH_CLASS_NAMES[key]} {quality}"


# ── Circle of Fifths ────────────────────────────────────────────────────────
#
# The circle is ordered by ascending perfect fifths (7 semitones):
#   C → G → D → A → E → B → F#/Gb → Db → Ab → Eb → Bb → F → (C)
#
# Position on the circle for each pitch class (0-11):

_CIRCLE_POS: list[int] = [
    # C  C#  D  D#  E  F  F#  G  G#  A  A#  B
      0,  7,  2,  9,  4, 11,  6,  1,  8,  3, 10,  5,
]


def _circle_distance(pc_a: int, pc_b: int) -> int:
    """Shortest step-distance on the Circle of Fifths (0-6)."""
    diff = abs(_CIRCLE_POS[pc_a] - _CIRCLE_POS[pc_b])
    return min(diff, 12 - diff)


def _relative_minor(major_pc: int) -> int:
    """Pitch class of the relative minor (3 semitones below)."""
    return (major_pc - 3) % 12


def _relative_major(minor_pc: int) -> int:
    """Pitch class of the relative major (3 semitones above)."""
    return (minor_pc + 3) % 12


def compare_keys(
    key_a: int, mode_a: int,
    key_b: int, mode_b: int,
) -> dict:
    """Compare two keys and return distance, relationship label, and description.

    Parameters
    ----------
    key_a, key_b : int
        Spotify pitch-class integers (0 = C … 11 = B).
    mode_a, mode_b : int
        0 = minor, 1 = major.

    Returns
    -------
    dict with ``distance``, ``relationship``, ``description``.
    """
    name_a = key_name(key_a, mode_a)
    name_b = key_name(key_b, mode_b)

    # Same key
    if key_a == key_b and mode_a == mode_b:
        return {
            "distance": 0,
            "relationship": "same key",
            "description": f"Both songs are in {name_a}.",
        }

    # Relative major/minor
    if mode_a != mode_b:
        if mode_a == 1 and _relative_minor(key_a) == key_b:
            return {
                "distance": 0,
                "relationship": "relative major/minor",
                "description": (
                    f"{name_a} and {name_b} are relative keys \u2014 "
                    "they share the same notes."
                ),
            }
        if mode_a == 0 and _relative_major(key_a) == key_b:
            return {
                "distance": 0,
                "relationship": "relative major/minor",
                "description": (
                    f"{name_a} and {name_b} are relative keys \u2014 "
                    "they share the same notes."
                ),
            }

    # Parallel major/minor (same root, different quality)
    if key_a == key_b and mode_a != mode_b:
        return {
            "distance": 1,
            "relationship": "parallel",
            "description": (
                f"{name_a} and {name_b} are parallel keys \u2014 "
                "same root note with a different mood."
            ),
        }

    # Circle of Fifths distance (normalized to major root for fair comparison)
    root_a = key_a if mode_a == 1 else _relative_major(key_a)
    root_b = key_b if mode_b == 1 else _relative_major(key_b)
    dist = _circle_distance(root_a, root_b)

    if dist <= 1:
        relationship = "closely related"
        desc = (
            f"{name_a} and {name_b} are closely related keys \u2014 "
            "they share most of the same notes."
        )
    elif dist <= 2:
        relationship = "moderately related"
        desc = (
            f"{name_a} and {name_b} are moderately related \u2014 "
            "they share several common tones."
        )
    else:
        relationship = "distant"
        desc = (
            f"{name_a} and {name_b} are distant keys \u2014 "
            "a transition between them creates harmonic tension."
        )

    return {
        "distance": dist,
        "relationship": relationship,
        "description": desc,
    }


# ── Mood / character associations ───────────────────────────────────────────
#
# Based on commonly cited associations from Baroque/Romantic-era key
# characterizations (Schubart, Charpentier) adapted for modern pop/electronic.

KEY_MOODS: dict[str, str] = {
    "C Major":     "Bright, pure, innocent",
    "C Minor":     "Dark, dramatic, passionate",
    "C#/Db Major": "Warm, rich, lustrous",
    "C#/Db Minor": "Brooding, intense, introspective",
    "D Major":     "Triumphant, joyful, energetic",
    "D Minor":     "Melancholy, serious, contemplative",
    "D#/Eb Major": "Bold, heroic, majestic",
    "D#/Eb Minor": "Anxious, dark, deeply emotional",
    "E Major":     "Radiant, powerful, bright",
    "E Minor":     "Tender, wistful, restless",
    "F Major":     "Pastoral, warm, compliant",
    "F Minor":     "Sorrowful, funereal, harrowing",
    "F#/Gb Major": "Ethereal, dreamy, unconventional",
    "F#/Gb Minor": "Gloomy, mysterious, enigmatic",
    "G Major":     "Optimistic, rustic, cheerful",
    "G Minor":     "Serious, urgent, discontent",
    "G#/Ab Major": "Lyrical, graceful, romantic",
    "G#/Ab Minor": "Tense, anguished, searching",
    "A Major":     "Confident, bright, loving",
    "A Minor":     "Tender, melancholy, reflective",
    "A#/Bb Major": "Joyful, quaint, warm",
    "A#/Bb Minor": "Dark, somber, morbid",
    "B Major":     "Wild, passionate, piercing",
    "B Minor":     "Solitary, patient, accepting",
}


def mood_for_key(key: int, mode: int) -> str:
    """Return the mood string for a given key/mode, or a sensible default."""
    return KEY_MOODS.get(key_name(key, mode), "")
