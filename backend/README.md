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

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Create account |
| POST | `/auth/login` | Log in |
| GET | `/spotify/search?q=...` | Search Spotify |
| POST | `/creator/analyze` | Upload + analyze a track (creator mode) |
| POST | `/clusters/analyze` | Analyze a song cluster (listener mode) |
| POST | `/recommendations` | Get recommendations from a fingerprint |
| POST | `/compare` | Compare two fingerprints |
| GET | `/me/analyses` | List saved analyses |
| GET | `/analyses/{id}` | Get analysis details |
| POST | `/analyses/{id}/share` | Generate share link |
| GET | `/share/{slug}` | View shared analysis |

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
│   └── recommend.py     # Recommendations + comparison
├── services/
│   ├── audio.py         # YouTube download + audio file management
│   ├── spotify.py       # Spotify API client
│   ├── supabase_client.py # Supabase client singleton
│   ├── tribe.py         # TRIBE v2 inference (mock + real)
│   └── recommendations.py # Similarity search + cluster analysis
└── static/              # Rendered brain visualization frames
```

## Mock Mode

By default, `USE_MOCK_TRIBE=true` returns deterministic mock fingerprints
so the frontend can develop without a GPU. Set to `false` + configure
`TRIBE_WORKER_URL` when the TRIBE inference worker is running.
