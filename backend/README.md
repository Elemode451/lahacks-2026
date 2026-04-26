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
| `USE_MOCK_TRIBE` | `true` to use mock fingerprints (default), `false` for real TRIBE |
| `TRIBE_WORKER_URL` | URL of the TRIBE v2 inference worker |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | No | Create account |
| POST | `/auth/login` | No | Log in |
| GET | `/spotify/search?q=...` | No | Search Spotify |
| POST | `/creator/analyze` | No | Upload + analyze a track (creator mode) |
| POST | `/clusters/analyze` | Optional | Analyze a song cluster (listener mode); tracks user interactions when authenticated |
| POST | `/clusters/analyze/stream` | Optional | Same as above but streams per-song progress via SSE |
| POST | `/recommendations/similar` | Optional | Brain-region cosine similarity recommendations; with auth can exclude previously recommended songs |
| POST | `/recommendations/collaborative` | Required | "Users like you also like" — collaborative filtering |
| GET | `/recommendations/history` | Required | Previously recommended songs for the user |
| DELETE | `/recommendations/history` | Required | Clear recommendation history (resets de-duplication) |
| POST | `/recommendations/compare` | No | Compare two fingerprints |
| GET | `/me/analyses` | Required | List saved analyses |
| GET | `/analyses/{id}` | Optional | Get analysis details (public if shared) |
| POST | `/analyses/{id}/share` | Required | Generate share link |
| GET | `/share/{slug}` | No | View shared analysis |

## Architecture

```
app/
├── main.py              # FastAPI app + middleware
├── config.py            # Settings from env vars
├── models/
│   └── schemas.py       # Pydantic request/response models
├── routers/
│   ├── auth.py          # Signup/login
│   ├── spotify_router.py # Spotify search
│   ├── creator.py       # Creator mode analysis
│   ├── clusters.py      # Listener cluster analysis
│   ├── analyses.py      # Saved analyses CRUD + sharing
│   └── recommend.py     # Recommendations (similar, collaborative, history)
├── services/
│   ├── audio.py         # YouTube download + audio file management
│   ├── spotify.py       # Spotify API client
│   ├── supabase_client.py # Supabase client singleton
│   ├── tribe.py         # TRIBE v2 inference (mock + real)
│   ├── song_cache.py    # Supabase cache + recommendation queries
│   └── recommendations.py # Similarity search + cluster analysis
└── static/              # Rendered brain visualization frames
```

## Mock Mode

By default, `USE_MOCK_TRIBE=true` returns deterministic mock fingerprints
so the frontend can develop without a GPU. Set to `false` + configure
`TRIBE_WORKER_URL` when the TRIBE inference worker is running.
