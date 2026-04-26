# Seratone

**Music discovery through predicted brain-response similarity.**

Seratone helps listeners find songs that *feel the same* by comparing music in predicted cortical-response space instead of relying on genre, artist, or listening history.

Users submit a Spotify playlist or individual songs. Seratone uses [TRIBE v2](https://huggingface.co/neuralcodex/TRIBEv2), a brain-encoding model, to generate a predicted cortical-response fingerprint for each song. It measures how coherent the group is and recommends new songs with similar predicted response patterns.

Seratone also includes **Creator Mode**, where artists upload their own music, visualize its predicted cortical-response profile, and compare it against songs in the database.

An AI music consultant, **Sera** (powered by ASI:One), provides conversational analysis of the brain-response data — translating neural activation patterns into creative insights.

## What It Does

### Listener Mode

- Submit a Spotify playlist or individual songs (Spotify / YouTube)
- Generate predicted cortical-response fingerprints rendered on a 3D brain mesh (fsaverage5, 20,484 vertices)
- Stream per-song progress via SSE — no timeouts on large playlists
- Get recommendations based on brain-response similarity (cosine similarity on region scores)
- Compare your music taste profile with friends via shareable analysis links

### Creator Mode

- Upload an original track
- View a 3D brain visualization of the model-predicted cortical response
- See region-level response scores and a 30-segment temporal timeline
- Chat with Sera, the AI music consultant, for creative feedback grounded in neural data
- Compare the track against songs in the database — find which existing songs are closest in predicted response space

## Why Seratone

Most recommendation systems use metadata: genre, artist, listening history, collaborative filtering, popularity.

But people often like songs for reasons they cannot explain. Two songs can come from totally different artists, genres, languages, or eras and still hit the same emotional space.

Seratone explores a different question:

> What if we recommended music by predicted brain-response similarity?
> How can artists use a cortical response to motivate production choices?

## Tech Stack

### Frontend

- React / Next.js (App Router)
- Tailwind CSS v4
- Framer Motion (spring physics, layout animations)
- Three.js / React Three Fiber / drei — 3D brain mesh visualization
- Recharts — radar chart for audio features
- Custom GLSL shaders (ColorBends, MagicRings, Noise)

### Backend

- FastAPI (Python 3.12+)
- Async pipeline with SSE streaming (`/clusters/analyze/stream`)
- Supabase — auth, song cache, user profiles, analysis persistence
- Spotify Web API — playlist resolution, track metadata, audio features
- ASI:One LLM — Sera agent chat
- NumPy / scikit-learn — cosine similarity, region aggregation

### TRIBE v2 Inference Worker

- Runs on Google Colab with A100 GPU
- Loads the 25 GB TRIBE v2 model (audio encoder + LLaMA 3.2-3B)
- Exposes a FastAPI server via Cloudflare Quick Tunnel
- ~1-2 min inference per song

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Frontend   │────▶│   Backend    │────▶│  Colab Worker   │
│  Next.js     │◀────│  FastAPI     │◀────│  TRIBE v2 + GPU │
│  :3000       │ SSE │  :8000       │     │  :8001 (tunnel) │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────┴───────┐
                    │   Supabase   │
                    │  Auth + DB   │
                    └──────────────┘
```

## Core Pipeline

```
Spotify playlist URL / YouTube URL / audio file
→ resolve tracks (Spotify embed scrape)
→ download audio (yt-dlp)
→ TRIBE v2 predicted cortical response (Colab GPU)
→ 20,484-vertex fingerprint + 30 temporal segments
→ region-level scores (12 brain regions)
→ cache to Supabase
→ cosine similarity search → recommendations
→ Sera agent chat (ASI:One) → creative insights
```

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- Supabase project ([supabase.com](https://supabase.com))
- Spotify Developer app ([developer.spotify.com](https://developer.spotify.com/dashboard))
- ASI:One API key (for Sera agent)
- Google Colab with GPU (for TRIBE inference; use mock mode without)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .

cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY,
#          SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET,
#          TRIBE_WORKER_URL, ASI1_API_KEY

uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### TRIBE Worker (Colab)

1. Open `backend/tribe_worker_colab.ipynb` in Google Colab (A100 GPU runtime)
2. Run Cell 1 — install packages
3. Run Cell 2 — load model + start server (background subprocess)
4. Run Cell 3 — start Cloudflare tunnel (prints tunnel URL)
5. Set `TRIBE_WORKER_URL=<tunnel URL>` in backend `.env` and restart

Without a GPU, set `USE_MOCK_TRIBE=true` to develop with deterministic mock fingerprints.

### Demo Account

```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "dwelicki@uw.edu", "password": "demo1234", "display_name": "Demo"}'
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SPOTIFY_CLIENT_ID` | Spotify Developer app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer app client secret |
| `SPOTIFY_REDIRECT_URI` | Spotify OAuth redirect URI |
| `FRONTEND_URL` | Frontend origin for CORS/redirects (default: `http://localhost:3000`) |
| `TRIBE_WORKER_URL` | URL of the TRIBE v2 Colab worker |
| `USE_MOCK_TRIBE` | `true` for mock fingerprints (default), `false` for real TRIBE |
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
| POST | `/creator/analyze` | No | Analyze a track (creator mode) |
| GET | `/creator/analyses` | Yes | List creator analyses |
| POST | `/clusters/analyze` | Optional | Analyze a song cluster (synchronous) |
| POST | `/clusters/analyze/stream` | Optional | Same but streams per-song progress via SSE |
| POST | `/agent/chat` | Yes | Chat with Sera AI music consultant |
| POST | `/recommendations/similar` | Optional | Brain-region cosine similarity recommendations |
| POST | `/recommendations/collaborative` | Yes | Collaborative filtering recommendations |
| GET | `/recommendations/history` | Yes | Previously recommended songs |
| DELETE | `/recommendations/history` | Yes | Clear recommendation history |
| POST | `/recommendations/compare` | No | Compare two fingerprints |
| GET | `/me/analyses` | Yes | List saved analyses |
| GET | `/analyses/{id}` | Optional | Get analysis details |
| GET | `/analyses/{id}/fingerprints` | Optional | Get fingerprint data for an analysis |
| POST | `/analyses/{id}/share` | Yes | Generate share link |
| GET | `/share/{slug}` | No | View shared analysis |

## SSE Streaming (`/clusters/analyze/stream`)

Submit a playlist for analysis and receive real-time progress events:

```bash
curl -N -X POST http://localhost:8000/clusters/analyze/stream \
  -H "Content-Type: application/json" \
  -d '{"spotify_playlist_url": "https://open.spotify.com/playlist/..."}'
```

### SSE Events

| Event | Data | When |
|-------|------|------|
| `progress` | `{message, total}` | Playlist resolved |
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

## Project Structure

```
├── frontend/                # Next.js app
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components (BrainMesh, ChatInterface, etc.)
│   │   └── lib/             # Auth context, utilities
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + middleware
│   │   ├── config.py        # Settings from env vars
│   │   ├── rate_limit.py    # slowapi rate limiter
│   │   ├── models/
│   │   │   └── schemas.py   # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── auth.py          # Signup/login + Spotify OAuth
│   │   │   ├── spotify_router.py # Spotify search
│   │   │   ├── creator.py       # Creator mode analysis
│   │   │   ├── clusters.py      # Listener cluster analysis + SSE streaming
│   │   │   ├── analyses.py      # Saved analyses CRUD + sharing
│   │   │   ├── recommend.py     # Recommendations (similar, collaborative, history)
│   │   │   └── agent_chat.py    # Sera AI music consultant
│   │   ├── services/
│   │   │   ├── audio.py         # YouTube download + audio file management
│   │   │   ├── spotify.py       # Spotify API client
│   │   │   ├── supabase_client.py # Supabase client singleton
│   │   │   ├── tribe.py         # TRIBE v2 inference (mock + real)
│   │   │   ├── song_cache.py    # Supabase cache + recommendation queries
│   │   │   └── recommendations.py # Similarity search + cluster analysis
│   │   └── utils/
│   │       └── auth.py          # JWT validation helpers
│   ├── tribe_worker_colab.ipynb  # Colab notebook for GPU inference
│   ├── supabase_schema.sql       # Database schema
│   └── pyproject.toml
└── docs/
    └── DESIGN_SYSTEM.md          # UI/UX design system documentation
```

## License

LA Hacks 2026
