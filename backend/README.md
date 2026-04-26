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

---

## Async Batch Analysis

Analysis is fully async. Submit songs → get a `batch_id` → listen for results via SSE.

### Step 1: Submit

```js
const resp = await fetch('/clusters/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    spotify_playlist_url: 'https://open.spotify.com/playlist/...',
  }),
});
const { batch_id, total_songs } = await resp.json();
// Returns immediately: { batch_id: "abc123", total_songs: 12, status: "processing" }
```

### Step 2: Listen for results (SSE)

```js
const es = new EventSource(`/clusters/batch/${batch_id}/events`);

es.addEventListener('song_complete', (e) => {
  const data = JSON.parse(e.data);
  // { song: "Coldplay - Yellow", index: 3, total: 12, cached: false }
  console.log(`[${data.index}/${data.total}] ${data.song} done`);
});

es.addEventListener('song_error', (e) => {
  const data = JSON.parse(e.data);
  // { song: "...", index: 3, total: 12, error: "No audio source" }
  console.warn(`Skipped: ${data.song}`);
});

es.addEventListener('complete', (e) => {
  const result = JSON.parse(e.data);
  // Full ClusterAnalyzeResponse with combined brain data
  console.log('All done!', result);
  es.close();
});

es.addEventListener('error', (e) => {
  console.error('Batch failed');
  es.close();
});
```

### SSE Events

| Event | Data | When |
|-------|------|------|
| `song_complete` | `{song, index, total, cached}` | Song finished and cached to Supabase |
| `song_error` | `{song, index, total, error}` | Song failed (skipped) |
| `complete` | Full `ClusterAnalyzeResponse` JSON | All songs done |
| `error` | `{message}` | Fatal error |

### Key behavior

- **Submit returns immediately** — processing runs in the background
- **Client can disconnect and reconnect** — the batch keeps processing regardless
- **Songs are cached to Supabase as they finish** — even if the client never reconnects, the work is saved
- **Keepalive comments** are sent every 30s to prevent proxy timeouts on the SSE connection

### Decoding Brain Data

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
