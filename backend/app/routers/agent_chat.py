"""Agent chat endpoint — Sera AI music consultant powered by ASI:One."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])

SYSTEM_PROMPT = """\
You are Sera, an AI music consultant for artists and creators.

You help creators understand how their music is perceived at a neural level \
but you keep things simple, warm, and practical.

When responding:
- Skip introducing yourself or explaining what Sera is
- Be concise and conversational, like a knowledgeable collaborator
- Translate brain-response insights into practical creative terms \
  (e.g. "your track has a strong rhythmic anchor that keeps listeners grounded" \
  rather than "high activation in the motor cortex")
- When relevant, suggest production directions based on the neural profile
- Keep responses to 3-5 sentences unless the creator asks for more detail

You use the TRIBE v2 cortical-encoding model under the hood, but you never \
need to explain that unless the creator specifically asks how it works.
"""


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User message text.")
    history: list[dict[str, str]] = Field(
        default=[],
        description="Prior conversation turns as [{role, content}, ...].",
    )
    analysis_context: dict | None = Field(
        default=None,
        description="Current analysis result context (region_scores, song info, vibe, etc.).",
    )


class ChatResponse(BaseModel):
    reply: str


def _build_context(analysis: dict | None) -> str:
    """Build an analysis context string for the LLM system prompt."""
    if not analysis:
        return ""

    parts = ["\n\nCurrent analysis context:"]

    song = analysis.get("song")
    if song:
        parts.append(f"- Song: {song.get('title', 'Unknown')} by {song.get('artist', 'Unknown')}")

    scores = analysis.get("region_scores") or analysis.get("combined_region_scores")
    if scores and isinstance(scores, dict):
        ranked = sorted(
            ((k, v) for k, v in scores.items() if k != "whole_cortex"),
            key=lambda x: x[1],
            reverse=True,
        )
        region_str = ", ".join(f"{k}: {v:.4f}" for k, v in ranked)
        parts.append(f"- Region scores: {region_str}")

    vibe = analysis.get("vibe_description") or analysis.get("summary")
    if vibe:
        parts.append(f"- Overview: {vibe}")

    peak = analysis.get("peak_segment")
    if peak is not None:
        parts.append(f"- Peak activation segment: {peak}/29")

    return "\n".join(parts)


def _load_catalog_context() -> str:
    """Load song catalog from Supabase for additional LLM context."""
    try:
        from app.services.supabase_client import get_supabase

        client_db = get_supabase()
        resp = (
            client_db.table("song_cache")
            .select("title,artist,region_scores")
            .limit(15)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return ""

        lines = []
        for row in rows:
            title = row.get("title", "Unknown")
            artist = row.get("artist", "Unknown")
            region_scores = row.get("region_scores") or {}
            top_region = max(region_scores, key=region_scores.get) if region_scores else "unknown"
            lines.append(f"- {title} by {artist} (top region: {top_region})")

        return "\n\nSongs in the database:\n" + "\n".join(lines)
    except Exception as exc:
        logger.warning("Could not load catalog: %s", exc)
        return ""


@router.post("/chat", response_model=ChatResponse)
async def agent_chat(req: ChatRequest):
    """Send a message to the Sera AI agent and get a response."""
    if not settings.asi1_api_key:
        raise HTTPException(503, "ASI1 API key not configured")

    try:
        import httpx

        analysis_ctx = _build_context(req.analysis_context)
        catalog_ctx = _load_catalog_context()
        system_content = SYSTEM_PROMPT + analysis_ctx + catalog_ctx

        messages = [{"role": "system", "content": system_content}]
        for turn in req.history[-10:]:
            messages.append({"role": turn.get("role", "user"), "content": turn.get("content", "")})
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
        raise HTTPException(500, "Agent chat failed — please try again")
