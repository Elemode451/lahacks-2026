"""Sera — AI music consultant chat endpoint for creators.

Provides a conversational interface backed by an LLM that has access to the
current song's TRIBE v2 analysis and the catalog of previously analyzed songs.
"""

from __future__ import annotations

import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.schemas import RegionScores
from app.services.song_cache import find_similar_songs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent-chat"])

SYSTEM_PROMPT = """\
You are Sera, an AI music consultant for artists and creators.

You help creators understand how their music is perceived at a neural level \
but you keep things simple, warm, and practical.

When responding:
- Skip introducing yourself or explaining what Sera is
- Be VERY concise and professional, like a knowledgeable source
- Translate brain-response insights into practical creative terms \
  (e.g. "your track has a strong rhythmic anchor that keeps listeners grounded" \
  rather than "high activation in the motor cortex")
- When relevant, suggest production directions based on the neural profile
- Keep responses to 1-2 sentences unless the creator asks for more detail
- Can compare the music to what you have

You use the TRIBE v2 cortical-encoding model under the hood, but you never \
need to explain that unless the creator specifically asks how it works.
"""


# ── Request / Response schemas ──────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'ai'")
    text: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(
        ..., description="Conversation history (user + ai turns)."
    )
    region_scores: dict[str, float] | None = Field(
        None,
        description="Region scores of the currently playing song.",
    )
    song_title: str | None = None
    song_artist: str | None = None
    analysis_id: str | None = None


class ChatResponse(BaseModel):
    reply: str


# ── Context helpers ─────────────────────────────────────────────────────────


def _build_context(
    region_scores: dict[str, float] | None,
    song_title: str | None,
    song_artist: str | None,
) -> str:
    """Build a context block describing the current song's analysis."""
    if not region_scores:
        return ""

    parts: list[str] = ["## Current Song Analysis"]

    if song_title or song_artist:
        label = song_title or "Untitled"
        if song_artist:
            label += f" by {song_artist}"
        parts.append(f"Track: {label}")

    # Full region scores as structured data for comparisons
    parts.append("\nRegion Scores (predicted cortical activation 0-1):")
    for region, score in sorted(region_scores.items(), key=lambda x: x[1], reverse=True):
        bar = "#" * int(score * 20)
        parts.append(f"  {region.replace('_', ' '):<25} {score:.4f}  {bar}")

    # Top activated regions summary
    sorted_regions = sorted(region_scores.items(), key=lambda x: x[1], reverse=True)
    top = [r for r in sorted_regions if r[0] != "whole_cortex"][:3]
    if top:
        names = ", ".join(r[0].replace("_", " ") for r in top)
        parts.append(f"\nStrongest predicted activation: {names}")

    return "\n".join(parts)


async def _load_catalog_context(
    region_scores: dict[str, float] | None,
    exclude_key: str | None = None,
    n: int = 10,
) -> str:
    """Load catalog songs with their region scores for comparison."""
    if not region_scores:
        return ""

    target = RegionScores(**region_scores)

    # find_similar_songs is synchronous (Supabase call) — run in thread
    results, total = await asyncio.to_thread(
        find_similar_songs,
        target,
        exclude_key=exclude_key,
        n=n,
    )

    if not results:
        return ""

    parts: list[str] = [
        f"\n## Song Catalog ({total} songs in database)",
        "Songs ranked by region-score similarity to the current track:\n",
    ]

    for i, song in enumerate(results, 1):
        title = song.get("title", "Unknown")
        artist = song.get("artist", "Unknown")
        sim = song.get("similarity", 0.0)
        rs = song.get("region_scores", {})

        parts.append(f"{i}. {title} by {artist} (similarity: {sim:.4f})")

        # Include region scores for each song so Sera can compare
        for region, val in sorted(rs.items(), key=lambda x: x[1], reverse=True):
            parts.append(f"     {region.replace('_', ' '):<25} {val:.4f}" if isinstance(val, (int, float)) else f"     {region.replace('_', ' '):<25} {val}")

    return "\n".join(parts)


async def _build_comparison_section(
    region_scores: dict[str, float] | None,
    exclude_key: str | None = None,
) -> str:
    """Compare the current song against the top 3 most similar songs.

    Uses cosine similarity on region scores via find_similar_songs.
    """
    if not region_scores:
        return ""

    target = RegionScores(**region_scores)

    top3, _ = await asyncio.to_thread(
        find_similar_songs,
        target,
        exclude_key=exclude_key,
        n=3,
    )

    if not top3:
        return ""

    region_keys = [
        "auditory", "superior_temporal", "temporo_parietal",
        "inferior_frontal", "multisensory", "whole_cortex",
    ]

    parts: list[str] = [
        "\n## How Your Track Compares (top 3 closest songs)",
    ]

    for rank, song in enumerate(top3, 1):
        title = song.get("title", "Unknown")
        artist = song.get("artist", "Unknown")
        sim = song.get("similarity", 0.0)
        rs = song.get("region_scores", {})

        parts.append(f"\n### {rank}. {title} by {artist} — similarity {sim:.4f}")

        # Region-by-region comparison
        parts.append(f"  {'Region':<25} {'Yours':>8} {'Theirs':>8} {'Diff':>8}")
        parts.append(f"  {'-' * 25} {'-' * 8} {'-' * 8} {'-' * 8}")
        for rk in region_keys:
            yours = region_scores.get(rk, 0.0)
            theirs = float(rs.get(rk, 0.0))
            diff = yours - theirs
            sign = "+" if diff >= 0 else ""
            parts.append(
                f"  {rk.replace('_', ' '):<25} {yours:>8.4f} {theirs:>8.4f} {sign}{diff:>7.4f}"
            )

    return "\n".join(parts)


# ── Chat endpoint ───────────────────────────────────────────────────────────


def _build_sera_reply(
    system_context: str,
    messages: list[ChatMessage],
) -> str:
    """Generate a reply from Sera.

    Currently uses a rule-based approach since no LLM API key is configured.
    When an LLM provider is added, this function can be swapped out.
    """
    last_msg = messages[-1].text.lower() if messages else ""

    # Extract any analysis data from context
    if not system_context:
        return (
            "I don't have any song data to work with right now. "
            "Upload a track in Creator Mode and I can break down its neural profile."
        )

    # Parse region data from context for smart replies
    context_lines = system_context.split("\n")
    region_data: dict[str, float] = {}
    for line in context_lines:
        line = line.strip()
        # Match lines like "  auditory                   0.7234  ##############"
        for region in ["auditory", "superior_temporal", "temporo_parietal",
                       "inferior_frontal", "multisensory", "whole_cortex"]:
            if line.startswith(region.replace("_", " ")):
                parts = line.split()
                for p in parts:
                    try:
                        region_data[region] = float(p)
                        break
                    except ValueError:
                        continue

    top_regions = sorted(region_data.items(), key=lambda x: x[1], reverse=True)
    top_regions = [(r, v) for r, v in top_regions if r != "whole_cortex"]

    # Check for comparison-related questions
    compare_keywords = ["compare", "similar", "like", "closest", "match", "versus", "vs"]
    is_comparison = any(kw in last_msg for kw in compare_keywords)

    if is_comparison and "How Your Track Compares" in system_context:
        # Extract comparison info
        comp_start = system_context.find("## How Your Track Compares")
        comp_section = system_context[comp_start:] if comp_start >= 0 else ""
        lines = comp_section.split("\n")
        song_names: list[str] = []
        for line in lines:
            if line.strip().startswith("### "):
                # Extract "1. Title by Artist — similarity 0.9234"
                name_part = line.strip().lstrip("# ").split(" — ")[0]
                # Remove leading number and dot
                name_part = name_part.split(". ", 1)[-1] if ". " in name_part else name_part
                song_names.append(name_part)

        if song_names:
            return (
                f"Your closest matches are {', '.join(song_names[:2])}. "
                "They share a similar activation profile, especially in the regions "
                "where your track is strongest."
            )

    # Respond based on what was asked
    if any(kw in last_msg for kw in ["region", "score", "activation", "brain", "cortex", "neural"]):
        if top_regions:
            r1_name = top_regions[0][0].replace("_", " ")
            r1_val = top_regions[0][1]
            return (
                f"Your strongest predicted activation is in the {r1_name} region "
                f"at {r1_val:.2f} — that means listeners are likely to feel a "
                f"strong {'rhythmic and tonal pull' if 'auditory' in r1_name else 'emotional and spatial response'}."
            )

    if any(kw in last_msg for kw in ["production", "improve", "suggest", "direction", "advice", "tip"]):
        if top_regions:
            weak = top_regions[-1] if len(top_regions) > 1 else None
            if weak:
                weak_name = weak[0].replace("_", " ")
                return (
                    f"Consider layering in elements that engage the {weak_name} region more — "
                    "spatial effects, harmonic complexity, or rhythmic variation could help "
                    "round out the neural profile."
                )

    if any(kw in last_msg for kw in ["peak", "moment", "strongest", "best part"]):
        return (
            "The peak activation moment is where the predicted brain response is most intense. "
            "That segment likely has the most emotionally compelling arrangement."
        )

    # Default: summarize the analysis
    if top_regions:
        names = [r[0].replace("_", " ") for r in top_regions[:2]]
        return (
            f"This track's neural fingerprint is anchored in {' and '.join(names)} activation. "
            "Ask me about specific regions, comparisons with other songs, or production suggestions."
        )

    return "I can see the analysis data. What would you like to know about this track?"


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Chat with Sera about the currently analyzed song."""
    if not req.messages:
        raise HTTPException(400, "messages list cannot be empty")

    # Build the full context from song data + catalog
    song_context = _build_context(req.region_scores, req.song_title, req.song_artist)
    catalog_context = await _load_catalog_context(req.region_scores)
    comparison_context = await _build_comparison_section(req.region_scores)

    full_context = "\n\n".join(
        part for part in [SYSTEM_PROMPT, song_context, catalog_context, comparison_context] if part
    )

    reply = _build_sera_reply(full_context, req.messages)

    return ChatResponse(reply=reply)
