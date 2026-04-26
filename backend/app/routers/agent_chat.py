"""Sera — AI music consultant chat endpoint for creators.

Provides a conversational interface backed by ASI:One LLM that has access to the
current song's TRIBE v2 analysis and the catalog of previously analyzed songs.
"""

from __future__ import annotations

import asyncio
import logging

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.models.schemas import RegionScores
from app.rate_limit import limiter
from app.services.song_cache import find_similar_songs
from app.utils.auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])

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
@limiter.limit("10/minute")
async def agent_chat(
    request: Request,
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
