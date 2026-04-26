# SeraTune Backend

Music discovery through predicted brain-response similarity, powered by TRIBE v2.

## Quick Start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .

# Copy and fill in your credentials
cp .env.example .env

# Run the server
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase_schema.sql` in the SQL Editor
3. Copy your project URL, anon key, and service role key into `.env`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SPOTIFY_CLIENT_ID` | Spotify Developer app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer app client secret |
| `SPOTIFY_REDIRECT_URI` | Spotify OAuth redirect URI (e.g. `http://localhost:8000/auth/spotify/callback`) |
| `FRONTEND_URL` | Frontend origin for CORS and redirects (default: `http://localhost:3000`) |
| `USE_MOCK_TRIBE` | `true` to use mock fingerprints (default), `false` for real TRIBE |
| `TRIBE_WORKER_URL` | URL of the TRIBE v2 inference worker (Colab tunnel) |
| `ASI1_API_KEY` | ASI:One API key for Sera agent chat |
| `DEBUG` | Enable debug logging |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | No | Create account |
| POST | `/auth/login` | No | Log in |
| POST | `/auth/sync-profile` | Yes | Sync profile after OAuth |
| GET | `/auth/spotify` | No | Start Spotify OAuth flow |
| GET | `/auth/spotify/callback` | No | Spotify OAuth callback |
| POST | `/auth/spotify/refresh` | No | Refresh Spotify access token |
| GET | `/spotify/search?q=...` | No | Search Spotify catalog |
| POST | `/creator/analyze` | No | Upload + analyze a track (creator mode) |
| GET | `/creator/analyses` | Yes | List creator's analyses |
| POST | `/clusters/analyze` | Optional | Analyze a song cluster (synchronous — waits for all songs) |
| POST | `/clusters/analyze/stream` | Optional | Same but streams per-song progress via SSE |
| POST | `/agent/chat` | Yes | Chat with Sera AI music consultant |
| POST | `/recommendations/similar` | Optional | Brain-region cosine similarity recommendations |
| POST | `/recommendations/collaborative` | Yes | Collaborative filtering recommendations |
| GET | `/recommendations/history` | Yes | Previously recommended songs |
| DELETE | `/recommendations/history` | Yes | Clear recommendation history |
| POST | `/recommendations/compare` | No | Compare two fingerprints |
| GET | `/me/analyses` | Yes | List saved analyses |
| GET | `/analyses/{id}` | Optional | Get analysis details (public if shared) |
| GET | `/analyses/{id}/fingerprints` | Optional | Get fingerprint data for an analysis |
| POST | `/analyses/{id}/share` | Yes | Generate share link |
| GET | `/share/{slug}` | No | View shared analysis |

## Architecture

```
app/
├── main.py              # FastAPI app + middleware + rate limiting
├── config.py            # Settings from env vars
├── rate_limit.py        # slowapi rate limiter instance
├── models/
│   └── schemas.py       # Pydantic request/response models
├── routers/
│   ├── auth.py          # Signup/login + Spotify OAuth
│   ├── spotify_router.py # Spotify search
│   ├── creator.py       # Creator mode analysis
│   ├── clusters.py      # Listener cluster analysis + SSE streaming
│   ├── analyses.py      # Saved analyses CRUD + sharing
│   ├── recommend.py     # Recommendations (similar, collaborative, history)
│   └── agent_chat.py    # Sera AI music consultant (ASI:One)
├── services/
│   ├── audio.py         # YouTube download + audio file management
│   ├── spotify.py       # Spotify API client (search, track info, playlist scraping)
│   ├── supabase_client.py # Supabase client singleton
│   ├── tribe.py         # TRIBE v2 inference (mock + real via Colab worker)
│   ├── song_cache.py    # Supabase cache + recommendation queries
│   └── recommendations.py # Similarity search + cluster analysis
├── utils/
│   └── auth.py          # JWT validation helpers
└── static/              # Rendered brain visualization frames
```

## Mock Mode

By default, `USE_MOCK_TRIBE=true` returns deterministic mock fingerprints
so the frontend can develop without a GPU. Set to `false` + configure
`TRIBE_WORKER_URL` when the TRIBE inference worker is running.

---

## SSE Streaming (`/clusters/analyze/stream`)

For large playlists, use the streaming endpoint. It processes songs one at a time and sends SSE events as each completes — no timeouts.

```bash
curl -N -X POST http://localhost:8000/clusters/analyze/stream \
  -H "Content-Type: application/json" \
  -d '{"spotify_playlist_url": "https://open.spotify.com/playlist/..."}'
```

### SSE Events

| Event | Data | When |
|-------|------|------|
| `progress` | `{message, total}` | Playlist resolved, total tracks known |
| `song_complete` | `{song, index, total, cached}` | Song finished and cached to Supabase |
| `song_error` | `{song, index, total, error}` | Song failed (skipped) |
| `complete` | Full `ClusterAnalyzeResponse` JSON | All songs done |
| `error` | `{message}` | Fatal error |

### Frontend Usage

```js
const resp = await fetch('/clusters/analyze/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    spotify_playlist_url: 'https://open.spotify.com/playlist/...',
  }),
});
const reader = resp.body.getReader();
const decoder = new TextDecoder();
// Parse SSE events from the stream
```

### Key Behavior

- **Songs are cached to Supabase as they finish** — even if the client disconnects, completed results are saved
- **Cached songs resolve instantly** — only new songs require TRIBE inference
- **Keepalive comments** are sent periodically to prevent proxy timeouts on the SSE connection

---

## Synchronous Endpoint (`/clusters/analyze`)

For small clusters (3-6 songs), the synchronous endpoint waits for all songs to complete before returning the full response. Not recommended for large playlists — use the streaming endpoint instead.

```bash
curl -X POST http://localhost:8000/clusters/analyze \
  -H "Content-Type: application/json" \
  -d '{"spotify_playlist_url": "https://open.spotify.com/playlist/..."}'
```

---

## Sera Agent Chat (`/agent/chat`)

Chat with the AI music consultant powered by ASI:One. Pass the current song's analysis context for grounded responses.

```bash
curl -X POST http://localhost:8000/agent/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "What brain regions respond most to this track?",
    "analysis_context": { ... },
    "history": []
  }'
```

Requires `ASI1_API_KEY` in `.env`.

---

## Decoding Brain Data

```js
function decodeFingerprintB64(b64String) {
  const bytes = Uint8Array.from(atob(b64String), c => c.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

// 20,484 floats — one per cortical vertex on fsaverage5 mesh
const vertices = decodeFingerprintB64(data.combined_fingerprint_b64);

// 30 segments × 20,484 floats — for timeline scrubbing
const temporal = decodeFingerprintB64(data.temporal_fingerprints_b64);
// Segment i: temporal.slice(i * 20484, (i + 1) * 20484)
```

For full endpoint docs, see Swagger UI at `http://localhost:8000/docs`.
