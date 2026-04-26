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
    import json
    import re

    # Step 1: Scrape the embed page — it contains full track metadata in JSON
    results: list[SpotifySearchResult] = []
    embed_url = f"https://open.spotify.com/embed/playlist/{playlist_id}"
    try:
        resp = await client.get(
            embed_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            follow_redirects=True,
        )
        if resp.status_code == 200:
            html = resp.text
            # Extract __NEXT_DATA__ JSON from the embed page
            for script_body in re.findall(r"<script[^>]*>(.*?)</script>", html, re.DOTALL):
                if len(script_body) < 500 or '"trackList"' not in script_body:
                    continue
                try:
                    page_data = json.loads(script_body)
                    track_list = (
                        page_data.get("props", {})
                        .get("pageProps", {})
                        .get("state", {})
                        .get("data", {})
                        .get("entity", {})
                        .get("trackList", [])
                    )
                    for track in track_list:
                        uri = track.get("uri", "")
                        tid_match = re.search(r"spotify:track:([a-zA-Z0-9]+)", uri)
                        if not tid_match:
                            continue
                        preview = track.get("audioPreview") or {}
                        results.append(SpotifySearchResult(
                            spotify_id=tid_match.group(1),
                            title=track.get("title", "Unknown"),
                            artist=track.get("subtitle", "Unknown"),
                            album=None,
                            album_art_url=None,
                            preview_url=preview.get("url"),
                        ))
                    break
                except (json.JSONDecodeError, KeyError):
                    continue
    except Exception:
        logger.warning("Failed to fetch embed page %s", embed_url)

    # Fallback: if embed JSON parsing failed, try regex scraping + API batch fetch
    if not results:
        track_ids: list[str] = []
        for page_url in [embed_url, f"https://open.spotify.com/playlist/{playlist_id}"]:
            try:
                resp = await client.get(
                    page_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    },
                    follow_redirects=True,
                )
                if resp.status_code == 403:
                    continue
                resp.raise_for_status()
                track_ids = list(dict.fromkeys(
                    re.findall(r"(?:spotify:track:|/track/)([a-zA-Z0-9]{22})", resp.text)
                ))
                if track_ids:
                    break
            except Exception:
                continue

        if track_ids:
            token = await _get_token()
            for i in range(0, len(track_ids), 50):
                batch = track_ids[i : i + 50]
                try:
                    resp = await client.get(
                        f"https://api.spotify.com/v1/tracks?ids={','.join(batch)}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    for track in data.get("tracks", []):
                        if track:
                            artists = ", ".join(a["name"] for a in track.get("artists", []))
                            images = track.get("album", {}).get("images", [])
                            results.append(SpotifySearchResult(
                                spotify_id=track["id"],
                                title=track["name"],
                                artist=artists,
                                album=track.get("album", {}).get("name"),
                                album_art_url=images[0]["url"] if images else None,
                                preview_url=track.get("preview_url"),
                            ))
                except Exception:
                    logger.warning("Batch track fetch failed for %d IDs", len(batch))

    logger.info("Fetched %d tracks from Spotify playlist %s", len(results), playlist_id)
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


async def _yt_search_http(query: str) -> str | None:
    """Fallback YouTube search via HTTP scraping (no yt-dlp search needed)."""
    import re
    import urllib.parse

    search_url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": query})
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            search_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )
        resp.raise_for_status()
        # Extract first video ID from search results page
        match = re.search(r'"videoId":"([a-zA-Z0-9_-]{11})"', resp.text)
        if match:
            return f"https://www.youtube.com/watch?v={match.group(1)}"
    return None


async def get_audio_features(spotify_id: str) -> dict | None:
    """Fetch audio features for a single Spotify track by ID.

    Returns a dict with keys like ``key``, ``mode``, ``tempo``,
    ``time_signature``, etc., or *None* on failure.
    """
    token = await _get_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.spotify.com/v1/audio-features/{spotify_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code in (404, 400):
            return None
        resp.raise_for_status()
        return resp.json()


async def get_audio_features_batch(spotify_ids: list[str]) -> list[dict]:
    """Fetch audio features for up to 100 Spotify tracks in one call.

    Returns a list of feature dicts (``None`` entries are skipped for
    tracks that could not be resolved).
    """
    if not spotify_ids:
        return []

    token = await _get_token()
    results: list[dict] = []
    # Spotify allows max 100 IDs per request
    for i in range(0, len(spotify_ids), 100):
        batch = spotify_ids[i : i + 100]
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.spotify.com/v1/audio-features",
                headers={"Authorization": f"Bearer {token}"},
                params={"ids": ",".join(batch)},
            )
            resp.raise_for_status()
            features = resp.json().get("audio_features", [])
            for feat in features:
                if feat is not None:
                    results.append(feat)
    return results


async def search_youtube_for_track(title: str, artist: str) -> str | None:
    """Search YouTube for an audio version of a Spotify track.

    Tries yt-dlp search first, falls back to HTTP scraping if yt-dlp
    returns no results (common when yt-dlp is outdated).
    Returns a YouTube URL or None.
    """
    import asyncio

    query = f"{artist} - {title} audio"
    logger.info("Searching YouTube for: %s", query)

    # Try yt-dlp search first
    try:
        url = await asyncio.to_thread(_yt_search_sync, query)
        if url:
            logger.info("YouTube match (yt-dlp) for '%s': %s", query, url)
            return url
    except Exception:
        logger.warning("yt-dlp search errored for: %s", query)

    # Fallback: HTTP scrape of YouTube search results
    try:
        url = await _yt_search_http(query)
        if url:
            logger.info("YouTube match (http) for '%s': %s", query, url)
            return url
    except Exception:
        logger.exception("YouTube HTTP search also failed for: %s", query)

    logger.warning("YouTube search returned no results for: %s", query)
    return None
