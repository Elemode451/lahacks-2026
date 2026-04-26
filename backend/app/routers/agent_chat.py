"""Sera — AI music consultant chat endpoint for creators.

Provides a conversational interface backed by ASI:One LLM that has access to the
current song's TRIBE v2 analysis and the catalog of previously analyzed songs.
"""

from __future__ import annotations

import asyncio
import logging

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.models.schemas import RegionScores
from app.services.emotions import map_region_scores_to_emotions
from app.services.song_cache import find_similar_songs
from app.utils.auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])

SYSTEM_PROMPT = """\
You are Sera, an AI music consultant for artists and creators.

You help creators understand how their music makes people *feel* — the \
emotions, vibes, and psychological responses their music is predicted to evoke.

When responding:
- Skip introducing yourself or explaining what Sera is
- Be VERY concise and professional, like a knowledgeable source
- Talk about emotions and feelings, not brain regions. Use words like \
  nostalgia, euphoria, chills, groove, tension, awe, immersion, anticipation
- Translate brain-response data into emotional language \
  (e.g. "your track evokes strong nostalgia and rhythmic groove" \
  rather than "high activation in the superior temporal region")
- Compare emotional profiles between songs when relevant \
  (e.g. "both tracks trigger musical chills, but yours leans more into euphoria")
- Suggest what emotional effect production choices create \
  (e.g. "adding reverb depth could push the awe and immersion response higher")
- When relevant, suggest production directions based on the emotional profile
- Keep responses to 1-2 sentences unless the creator asks for more detail
- Can compare the music to what you have

You have access to predicted emotional profiles derived from a brain-encoding \
model. These map brain region activations to emotions like nostalgia, groove, \
musical chills, awe, euphoria, anticipation, and transcendence. Use these to \
ground your advice in how listeners are predicted to *feel*.

You use the TRIBE v2 cortical-encoding model under the hood, but you never \
need to explain that unless the creator specifically asks how it works.
"""


# ── Request / Response schemas ──────────────────────────────────────────────


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User message text.")
    history: list[Any] = Field(
        default=[],
        description="Prior conversation turns as [{role, content}, ...].",
    )
    analysis_context: Any = Field(
        default=None,
        description="Current analysis result context (region_scores, song info, vibe, etc.).",
    )


class ChatResponse(BaseModel):
    reply: str


# ── Context helpers ─────────────────────────────────────────────────────────


def _build_context(analysis: Any) -> str:
    """Build a context block describing the current song's analysis."""
    if not analysis or not isinstance(analysis, dict):
        return ""

    parts: list[str] = ["\n\n## Current Song Analysis"]

    song = analysis.get("song")
    if song:
        parts.append(f"Track: {song.get('title', 'Unknown')} by {song.get('artist', 'Unknown')}")

    scores = analysis.get("region_scores") or analysis.get("combined_region_scores")
    if scores and isinstance(scores, dict):
        parts.append("\nRegion Scores (predicted cortical activation 0-1):")
        for region, score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
            if isinstance(score, (int, float)):
                bar = "#" * int(score * 20)
                parts.append(f"  {region.replace('_', ' '):<25} {score:.4f}  {bar}")

        top = [(r, v) for r, v in sorted(scores.items(), key=lambda x: x[1], reverse=True) if r != "whole_cortex"][:3]
        if top:
            names = ", ".join(r.replace("_", " ") for r, _ in top)
            parts.append(f"\nStrongest predicted activation: {names}")

    vibe = analysis.get("vibe_description") or analysis.get("summary")
    if vibe:
        parts.append(f"\nOverview: {vibe}")

    peak = analysis.get("peak_segment")
    if peak is not None:
        parts.append(f"Peak activation segment: {peak}/29")

    # Build emotional profile section from region scores
    emo_profile = analysis.get("emotional_profile")
    if not emo_profile and scores and isinstance(scores, dict):
        try:
            rs = RegionScores(**{k: v for k, v in scores.items() if isinstance(v, (int, float))})
            emo_profile = map_region_scores_to_emotions(rs)
        except Exception:
            pass

    if emo_profile and isinstance(emo_profile, dict):
        parts.append("\n## Predicted Emotional Response")
        dominant = emo_profile.get("dominant_emotions", [])
        if dominant:
            emo_labels = []
            emotions_list = emo_profile.get("emotions", [])
            for emo_name in dominant:
                matching = [e for e in emotions_list if e.get("name") == emo_name]
                if matching:
                    level = matching[0].get("level", "")
                    emo_labels.append(f"{emo_name} ({level})")
                else:
                    emo_labels.append(emo_name)
            parts.append(f"Primary emotions: {', '.join(emo_labels)}")

        emo_summary = emo_profile.get("summary", "")
        if emo_summary:
            parts.append(emo_summary)

        # List top emotions with descriptions for richer context
        emotions_list = emo_profile.get("emotions", [])
        high_emotions = [e for e in emotions_list if e.get("level") == "high"]
        if high_emotions:
            parts.append("\nKey emotional dimensions:")
            for emo in high_emotions[:4]:
                parts.append(f"  - {emo['name']}: {emo.get('description', '')}")

    return "\n".join(parts)


def _extract_region_scores(analysis: Any) -> dict[str, float] | None:
    """Extract region scores dict from analysis context."""
    if not analysis or not isinstance(analysis, dict):
        return None
    scores = analysis.get("region_scores") or analysis.get("combined_region_scores")
    if scores and isinstance(scores, dict):
        return {k: float(v) for k, v in scores.items() if isinstance(v, (int, float))}
    return None


def _load_catalog_context(region_scores: dict[str, float] | None) -> str:
    """Load catalog songs ranked by similarity for LLM context."""
    if not region_scores:
        return ""

    try:
        target = RegionScores(**region_scores)
        results, total = find_similar_songs(target, n=10)

        if not results:
            return ""

        parts: list[str] = [
            f"\n\n## Song Catalog ({total} songs in database)",
            "Songs ranked by region-score similarity to the current track:\n",
        ]

        for i, song in enumerate(results, 1):
            title = song.get("title", "Unknown")
            artist = song.get("artist", "Unknown")
            sim = song.get("similarity", 0.0)
            rs = song.get("region_scores", {})

            parts.append(f"{i}. {title} by {artist} (similarity: {sim:.4f})")
            for region, val in sorted(rs.items(), key=lambda x: x[1], reverse=True):
                if isinstance(val, (int, float)):
                    parts.append(f"     {region.replace('_', ' '):<25} {val:.4f}")

        return "\n".join(parts)
    except Exception as exc:
        logger.warning("Could not load catalog context: %s", exc)
        return ""


def _build_comparison_section(region_scores: dict[str, float] | None) -> str:
    """Compare the current song against the top 3 most similar songs."""
    if not region_scores:
        return ""

    try:
        target = RegionScores(**region_scores)
        top3, _ = find_similar_songs(target, n=3)

        if not top3:
            return ""

        region_keys = [
            "auditory", "superior_temporal", "temporo_parietal",
            "inferior_frontal", "multisensory", "whole_cortex",
        ]

        parts: list[str] = ["\n\n## How Your Track Compares (top 3 closest songs)"]

        for rank, song in enumerate(top3, 1):
            title = song.get("title", "Unknown")
            artist = song.get("artist", "Unknown")
            sim = song.get("similarity", 0.0)
            rs = song.get("region_scores", {})

            parts.append(f"\n### {rank}. {title} by {artist} — similarity {sim:.4f}")
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
    except Exception as exc:
        logger.warning("Could not build comparison: %s", exc)
        return ""


# ── Chat endpoint ───────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
async def agent_chat(
    req: ChatRequest,
    _user_id: str = Depends(require_auth),
):
    """Send a message to the Sera AI agent and get a response."""
    if not settings.asi1_api_key:
        raise HTTPException(503, "ASI1 API key not configured")

    try:
        import httpx

        analysis_ctx = _build_context(req.analysis_context)
        region_scores = _extract_region_scores(req.analysis_context)

        catalog_ctx = await asyncio.to_thread(_load_catalog_context, region_scores)
        comparison_ctx = await asyncio.to_thread(_build_comparison_section, region_scores)

        system_content = SYSTEM_PROMPT + analysis_ctx + catalog_ctx + comparison_ctx

        messages = [{"role": "system", "content": system_content}]
        for turn in req.history[-10:]:
            if not isinstance(turn, dict):
                continue
            role = str(turn.get("role", "user"))
            content = str(turn.get("content", ""))
            if role not in ("user", "assistant"):
                role = "user"
            messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": req.message})

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.asi1.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.asi1_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "asi1-mini",
                    "messages": messages,
                    "max_tokens": 600,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]

        return ChatResponse(reply=reply)

    except httpx.HTTPStatusError as exc:
        logger.exception("ASI1 API error")
        raise HTTPException(502, f"ASI1 API returned {exc.response.status_code}")
    except Exception:
        logger.exception("Agent chat error")
        raise HTTPException(500, "Agent chat is temporarily unavailable")
