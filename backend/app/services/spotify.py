"""Spotify Web API integration for song search and metadata."""

from __future__ import annotations

import base64
import logging
import time

import httpx

from app.config import settings
from app.models.schemas import SpotifySearchResult

logger = logging.getLogger(__name__)

_token: str | None = None
_token_expires_at: float = 0.0


async def _get_token() -> str:
    """Get a Spotify client-credentials access token, refreshing on expiry."""
    global _token, _token_expires_at
    if _token is not None and time.time() < _token_expires_at:
        return _token

    creds = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    encoded = base64.b64encode(creds.encode()).decode()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {encoded}"},
            data={"grant_type": "client_credentials"},
        )
        resp.raise_for_status()
        data = resp.json()
        _token = data["access_token"]
        _token_expires_at = time.time() + data.get("expires_in", 3600) - 60
        return _token


async def search_tracks(query: str, limit: int = 20) -> list[SpotifySearchResult]:
    """Search Spotify for tracks matching *query*."""
    token = await _get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query, "type": "track", "limit": limit},
        )
        resp.raise_for_status()
        items = resp.json().get("tracks", {}).get("items", [])

    results: list[SpotifySearchResult] = []
    for item in items:
        images = item.get("album", {}).get("images", [])
        results.append(
            SpotifySearchResult(
                spotify_id=item["id"],
                title=item["name"],
                artist=", ".join(a["name"] for a in item.get("artists", [])),
                album=item.get("album", {}).get("name"),
                album_art_url=images[0]["url"] if images else None,
                preview_url=item.get("preview_url"),
            )
        )
    return results


async def get_track_info(spotify_id: str) -> SpotifySearchResult | None:
    """Fetch metadata for a single Spotify track by ID."""
    token = await _get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.spotify.com/v1/tracks/{spotify_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        item = resp.json()

    images = item.get("album", {}).get("images", [])
    return SpotifySearchResult(
        spotify_id=item["id"],
        title=item["name"],
        artist=", ".join(a["name"] for a in item.get("artists", [])),
        album=item.get("album", {}).get("name"),
        album_art_url=images[0]["url"] if images else None,
        preview_url=item.get("preview_url"),
    )


async def get_playlist_tracks(playlist_id: str) -> list[SpotifySearchResult]:
    """Fetch all tracks from a public Spotify playlist by ID.

    WORKAROUND (client-credentials auth limitation):
    ─────────────────────────────────────────────────
    Spotify's playlist endpoints (/playlists/{id}/items, /playlists/{id}/tracks)
    require **user-level OAuth** (Authorization Code Flow) — they return 401/403
    with client-credentials tokens.

    As a temporary workaround, this function:
      1. Scrapes the public playlist page on open.spotify.com for track IDs
      2. Fetches each track's metadata via GET /tracks/{id} (which DOES work
         with client credentials)

    This only works for **public playlists**. Private/collaborative playlists
    will return 0 tracks.

    TODO(spotify-oauth): Once we add "Connect Spotify" (user OAuth login),
    replace this with a direct call to GET /playlists/{id}/items using the
    user's access token. This will:
      - Support private playlists
      - Be faster (batch endpoint instead of per-track fetches)
      - Be more reliable (no HTML scraping)
    See: https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
    """
    async with httpx.AsyncClient() as client:
        tracks = await _scrape_playlist_tracks(playlist_id, client)

    logger.info("Fetched %d tracks from Spotify playlist %s", len(tracks), playlist_id)
    return tracks


async def _scrape_playlist_tracks(
    playlist_id: str,
    client: httpx.AsyncClient,
) -> list[SpotifySearchResult]:
    """Extract track IDs from a public Spotify playlist page, then fetch metadata.

    TEMPORARY: This exists because client-credentials auth cannot access
    playlist track listing endpoints. Replace with direct API call once
    Spotify OAuth (user login) is implemented.
    See get_playlist_tracks() docstring for details.
    """
    import re

    # Step 1: Scrape the public playlist page for track IDs (no auth needed)
    resp = await client.get(
        f"https://open.spotify.com/playlist/{playlist_id}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    resp.raise_for_status()
    html = resp.text

    track_ids = list(dict.fromkeys(re.findall(r'/track/([a-zA-Z0-9]{22})', html)))
    logger.info("Scraped %d track IDs from playlist page %s", len(track_ids), playlist_id)

    if not track_ids:
        return []

    # Step 2: Fetch each track's metadata via the single-track API endpoint
    # (GET /tracks/{id} works with client credentials unlike the batch/playlist endpoints)
    results: list[SpotifySearchResult] = []
    for track_id in track_ids:
        info = await get_track_info(track_id)
        if info:
            results.append(info)
    return results



def parse_playlist_id(url: str) -> str | None:
    """Extract playlist ID from a Spotify playlist URL.

    Accepts formats like:
    - https://open.spotify.com/playlist/6c0GMeXcOG8odEO2UwCprx
    - https://open.spotify.com/playlist/6c0GMeXcOG8odEO2UwCprx?si=abc123
    - spotify:playlist:6c0GMeXcOG8odEO2UwCprx
    """
    import re

    # URL format
    m = re.search(r"open\.spotify\.com/playlist/([a-zA-Z0-9]+)", url)
    if m:
        return m.group(1)

    # URI format
    m = re.search(r"spotify:playlist:([a-zA-Z0-9]+)", url)
    if m:
        return m.group(1)

    return None


def _yt_search_sync(query: str) -> str | None:
    """Synchronous YouTube search via yt-dlp (runs in thread pool)."""
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "default_search": "ytsearch1",
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        result = ydl.extract_info(query, download=False)
        if result and "entries" in result and result["entries"]:
            entry = result["entries"][0]
            return entry.get("url") or f"https://www.youtube.com/watch?v={entry['id']}"
    return None


async def search_youtube_for_track(title: str, artist: str) -> str | None:
    """Search YouTube for an audio version of a Spotify track.

    Uses yt-dlp's built-in search to find the best match.
    The blocking yt-dlp call is offloaded to a thread pool.
    Returns a YouTube URL or None.
    """
    import asyncio

    query = f"{artist} - {title} audio"
    try:
        return await asyncio.to_thread(_yt_search_sync, query)
    except Exception:
        logger.exception("YouTube search failed for %s - %s", artist, title)
    return None
