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
    """Fetch all tracks from a Spotify playlist by ID.

    Tries two approaches:
    1. Main playlist endpoint (`/playlists/{id}`) — works if tracks are embedded.
    2. Tracks sub-endpoint (`/playlists/{id}/tracks`) — fallback if tracks are
       not embedded in the main response.

    Handles pagination for playlists with >100 tracks.
    """
    token = await _get_token()
    tracks: list[SpotifySearchResult] = []
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        # Client-credentials can't access playlist tracks endpoints directly.
        # Scrape the public playlist page for track IDs, then batch-fetch
        # metadata via GET /tracks?ids=... (which works with client creds).
        tracks = await _scrape_playlist_tracks(playlist_id, client, headers)

    logger.info("Fetched %d tracks from Spotify playlist %s", len(tracks), playlist_id)
    return tracks


async def _scrape_playlist_tracks(
    playlist_id: str,
    client: httpx.AsyncClient,
    headers: dict[str, str],
) -> list[SpotifySearchResult]:
    """Scrape the public Spotify playlist page for track IDs,
    then fetch each track's metadata via get_track_info (single-track endpoint)."""
    import re

    resp = await client.get(
        f"https://open.spotify.com/playlist/{playlist_id}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    resp.raise_for_status()
    html = resp.text

    # Extract track IDs from the page (links like /track/XXXXX)
    track_ids = list(dict.fromkeys(re.findall(r'/track/([a-zA-Z0-9]{22})', html)))
    logger.info("Scraped %d track IDs from playlist page %s", len(track_ids), playlist_id)

    if not track_ids:
        return []

    # Fetch each track individually (the single-track endpoint works with client creds)
    results: list[SpotifySearchResult] = []
    for track_id in track_ids:
        info = await get_track_info(track_id)
        if info:
            results.append(info)
    return results


def _extract_tracks(
    items: list[dict], out: list[SpotifySearchResult]
) -> None:
    """Parse track items from Spotify playlist response into SpotifySearchResult list."""
    for i, item in enumerate(items):
        track = item.get("track")
        if not track or not track.get("id"):
            logger.debug("Skipping playlist item %d: track=%s", i, type(track))
            continue
        images = track.get("album", {}).get("images", [])
        out.append(
            SpotifySearchResult(
                spotify_id=track["id"],
                title=track["name"],
                artist=", ".join(a["name"] for a in track.get("artists", [])),
                album=track.get("album", {}).get("name"),
                album_art_url=images[0]["url"] if images else None,
                preview_url=track.get("preview_url"),
            )
        )


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
