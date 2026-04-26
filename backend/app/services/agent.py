# agent.py — Sera: Brain-Response Music Discovery Agent
# Fully ASI:One-compatible with AgentChatProtocol

import os
import sys
import asyncio
import base64
import gzip
import io
import logging
from datetime import datetime
from uuid import uuid4
from dotenv import load_dotenv
from openai import OpenAI
import numpy as np

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

#Add project root to path so app.* imports work 
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

AGENT_SEED = os.getenv("AGENT_SEED", "sera-brain-music-seed-2024")
AGENT_PORT = int(os.getenv("AGENT_PORT", 8001))
ASI1_API_KEY = os.getenv("ASI1_API_KEY", "")

asyncio.set_event_loop(asyncio.new_event_loop())

logger = logging.getLogger(__name__)

#Agent Setup 
agent = Agent(
    name="sera_agent",
    seed=AGENT_SEED,
    port=AGENT_PORT,
    mailbox=True,
    publish_agent_details=True,
)

# ASI1 LLM Client
client = OpenAI(
    base_url="https://api.asi1.ai/v1",
    api_key=ASI1_API_KEY,
)

# Chat Protocol 
chat_proto = Protocol(spec=chat_protocol_spec)


SYSTEM_PROMPT = """
You are Sera, an AI music consultant for artists and creators.

You help creators understand how their music is perceived at a neural level 
but you keep things simple, warm, and practical. 

When responding:
- Skip introducing yourself or explaining what Sera is
- Be concise and conversational, like a knowledgeable collaborator
- Translate brain-response insights into practical creative terms
  (e.g. "your track has a strong rhythmic anchor that keeps listeners grounded" 
  rather than "high activation in the motor cortex")
- When relevant, suggest production directions based on the neural profile
- Keep responses to 3-5 sentences unless the creator asks for more detail

You use the TRIBE v2 cortical-encoding model under the hood, but you never 
need to explain that unless the creator specifically asks how it works.
"""


# Supabase loader
def load_catalog():
    """Load song metadata from Supabase for LLM context (no fingerprints)."""
    try:
        from app.services.supabase_client import get_supabase

        client_db = get_supabase()
        resp = (
            client_db.table("song_cache")
            .select("lookup_key,title,artist,region_scores,peak_index,fingerprint_id")
            .execute()
        )
        rows = resp.data or []
        logger.info(f"Loaded {len(rows)} songs from catalog")
        return rows

    except Exception as e:
        logger.warning(f"Could not load catalog from Supabase: {e}")
        return []


# Startup 
@agent.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info(f"Sera Agent activated")
    ctx.logger.info(f"   Address: {ctx.agent.address}")


# Message Handler 
@chat_proto.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    ctx.logger.info(f"Message from {sender}")

    # Send acknowledgement (required by chat protocol)
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.utcnow(),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    #Extract text
    user_text = ""
    for item in msg.content:
        if isinstance(item, TextContent):
            user_text += item.text

    if not user_text.strip():
        return

    ctx.logger.info(f"   Content: {user_text}")

    #Load catalog metadata and build context for LLM
    rows = load_catalog()
    if rows:
        catalog_lines = []
        for row in rows[:15]:
            title = row.get("title", "Unknown")
            artist = row.get("artist", "Unknown")
            region_scores = row.get("region_scores") or {}
            # Find top activated region
            top_region = max(region_scores, key=region_scores.get) if region_scores else "unknown"
            catalog_lines.append(f"- {title} by {artist} (top region: {top_region})")
        db_context = f"\n\nSongs currently in the database:\n" + "\n".join(catalog_lines)
    else:
        db_context = ""

    #Call ASI1 LLM
    response_text = "Sorry, I couldn't process that right now. Please try again."
    try:
        r = client.chat.completions.create(
            model="asi1-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT + db_context},
                {"role": "user", "content": user_text},
            ],
            max_tokens=600,
        )
        response_text = r.choices[0].message.content
        ctx.logger.info(f"LM responded successfully")
    except Exception as e:
        ctx.logger.error(f"LLM call failed: {e}")
        response_text = (
            "I'm having trouble connecting right now. Please try again in a moment!"
        )

    #Respond
    await ctx.send(
        sender,
        ChatMessage(
            timestamp=datetime.utcnow(),
            msg_id=uuid4(),
            content=[
                TextContent(type="text", text=response_text),
                EndSessionContent(type="end-session"),
            ],
        ),
    )


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"Acknowledgement received from {sender}")

agent.include(chat_proto)

if __name__ == "__main__":
    agent.run()