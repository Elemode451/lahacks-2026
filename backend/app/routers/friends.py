"""Friends list endpoints: add, remove, list, and activity feed."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import (
    FriendAddRequest,
    FriendItem,
    FriendFeedItem,
)
from app.services.supabase_client import get_supabase_admin
from app.utils.auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/friends", tags=["friends"])


@router.post("/add", response_model=FriendItem)
async def add_friend(
    req: FriendAddRequest,
    user_id: str = Depends(require_auth),
):
    """Add a friend by user ID or display name."""
    sb = get_supabase_admin()

    # Resolve the friend's user id
    friend_user_id: str | None = None

    if req.friend_id:
        # Verify the user actually exists before accepting the ID
        profile_check = (
            sb.table("profiles")
            .select("user_id")
            .eq("user_id", req.friend_id)
            .maybe_single()
            .execute()
        )
        if not profile_check.data:
            raise HTTPException(404, "User not found")
        friend_user_id = req.friend_id
    elif req.display_name:
        result = (
            sb.table("profiles")
            .select("user_id")
            .eq("display_name", req.display_name)
            .limit(1)
            .execute()
        )
        if result.data:
            friend_user_id = result.data[0]["user_id"]

    if not friend_user_id:
        raise HTTPException(404, "User not found")

    if friend_user_id == user_id:
        raise HTTPException(400, "Cannot add yourself as a friend")

    # Check if already friends
    existing = (
        sb.table("friends")
        .select("id")
        .eq("user_id", user_id)
        .eq("friend_id", friend_user_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(409, "Already friends")

    # Insert
    row = (
        sb.table("friends")
        .insert({"user_id": user_id, "friend_id": friend_user_id})
        .execute()
    )
    if not row.data:
        raise HTTPException(500, "Failed to add friend")

    inserted = row.data[0]

    # Fetch display name for the friend
    profile = (
        sb.table("profiles")
        .select("display_name")
        .eq("user_id", friend_user_id)
        .maybe_single()
        .execute()
    )
    display_name = (profile.data or {}).get("display_name", "")

    return FriendItem(
        id=inserted["id"],
        friend_id=friend_user_id,
        display_name=display_name,
        created_at=inserted.get("created_at"),
    )


@router.delete("/{friend_id}")
async def remove_friend(
    friend_id: str,
    user_id: str = Depends(require_auth),
):
    """Remove a friend by their user ID."""
    sb = get_supabase_admin()

    result = (
        sb.table("friends")
        .delete()
        .eq("user_id", user_id)
        .eq("friend_id", friend_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Friend not found")

    return {"ok": True}


@router.get("", response_model=list[FriendItem])
async def list_friends(user_id: str = Depends(require_auth)):
    """List the current user's friends."""
    sb = get_supabase_admin()

    result = (
        sb.table("friends")
        .select("id, friend_id, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Batch-fetch display names
    friend_ids = [r["friend_id"] for r in (result.data or [])]
    profiles_map: dict[str, str] = {}
    if friend_ids:
        profiles = (
            sb.table("profiles")
            .select("user_id, display_name")
            .in_("user_id", friend_ids)
            .execute()
        )
        for p in profiles.data or []:
            profiles_map[p["user_id"]] = p.get("display_name", "")

    return [
        FriendItem(
            id=r["id"],
            friend_id=r["friend_id"],
            display_name=profiles_map.get(r["friend_id"], ""),
            created_at=r.get("created_at"),
        )
        for r in (result.data or [])
    ]


@router.get("/feed", response_model=list[FriendFeedItem])
async def friends_feed(user_id: str = Depends(require_auth)):
    """Get recent songs analyzed by the user's friends.

    Joins friends -> user_song_interactions -> song_cache to produce
    a feed of recently analyzed songs by friends, most recent first.
    """
    sb = get_supabase_admin()

    # 1. Get friend IDs
    friends_result = (
        sb.table("friends")
        .select("friend_id")
        .eq("user_id", user_id)
        .execute()
    )
    friend_ids = [r["friend_id"] for r in (friends_result.data or [])]
    if not friend_ids:
        return []

    # 2. Get recent interactions from friends
    interactions = (
        sb.table("user_song_interactions")
        .select("user_id, song_key, interaction_type, created_at")
        .in_("user_id", friend_ids)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    if not interactions.data:
        return []

    # 3. Get unique song keys and fetch song metadata
    song_keys = list({r["song_key"] for r in interactions.data})
    songs_result = (
        sb.table("song_cache")
        .select("lookup_key, title, artist, region_scores")
        .in_("lookup_key", song_keys)
        .execute()
    )
    songs_map: dict[str, dict] = {}
    for s in songs_result.data or []:
        songs_map[s["lookup_key"]] = s

    # 4. Get display names for friends
    profiles = (
        sb.table("profiles")
        .select("user_id, display_name")
        .in_("user_id", friend_ids)
        .execute()
    )
    profiles_map: dict[str, str] = {}
    for p in profiles.data or []:
        profiles_map[p["user_id"]] = p.get("display_name", "")

    # 5. Build feed, deduplicating by (friend_id, song_key)
    seen: set[tuple[str, str]] = set()
    feed: list[FriendFeedItem] = []
    for interaction in interactions.data:
        key = (interaction["user_id"], interaction["song_key"])
        if key in seen:
            continue
        seen.add(key)

        song = songs_map.get(interaction["song_key"])
        if not song:
            continue

        feed.append(
            FriendFeedItem(
                friend_id=interaction["user_id"],
                friend_display_name=profiles_map.get(interaction["user_id"], ""),
                song_key=interaction["song_key"],
                title=song.get("title", "Unknown"),
                artist=song.get("artist", "Unknown"),
                interaction_type=interaction.get("interaction_type", "analyzed"),
                created_at=interaction.get("created_at"),
            )
        )

    return feed[:30]
