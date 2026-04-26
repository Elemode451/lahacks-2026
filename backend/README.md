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

## SSE Streaming Endpoint

`POST /clusters/analyze/stream` — same request body as `/clusters/analyze`, but
streams results via **Server-Sent Events** instead of waiting for the full batch.
The server only notifies the client when a song is committed to the database — no
intermediate polling or progress spam.

### SSE Events

| Event | Data | When |
|-------|------|------|
| `song_complete` | `{song, index, total, cached}` | Song finished and cached to Supabase |
| `song_error` | `{song, index, total, error}` | Song failed (skipped, continues to next) |
| `complete` | Full `ClusterAnalyzeResponse` JSON | All songs done — same shape as `POST /clusters/analyze` |
| `error` | `{message}` | Fatal error (no results) |

### Frontend Integration

```js
async function analyzeStream(requestBody, onSongDone, onComplete, onError) {
  const resp = await fetch('/clusters/analyze/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Optional: Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(requestBody),
  });

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    let eventType = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ') && eventType) {
        const data = JSON.parse(line.slice(6));
        switch (eventType) {
          case 'song_complete':
            // { song: "Coldplay - Yellow", index: 3, total: 12, cached: false }
            onSongDone(data);
            break;
          case 'song_error':
            // { song: "...", index: 3, total: 12, error: "No audio source" }
            onSongDone({ ...data, error: data.error });
            break;
          case 'complete':
            // Full ClusterAnalyzeResponse (same shape as POST /clusters/analyze)
            onComplete(data);
            break;
          case 'error':
            onError(data.message);
            break;
        }
        eventType = null;
      }
    }
  }
}

// Usage:
analyzeStream(
  { spotify_playlist_url: 'https://open.spotify.com/playlist/...' },
  (song) => console.log(`[${song.index}/${song.total}] ${song.song} done`),
  (result) => console.log('All done!', result),
  (err) => console.error('Error:', err),
);
```

### Decoding Brain Data

The `complete` event returns the same response as `POST /clusters/analyze`.
Decode the base64 vertex data:

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

For full endpoint docs (all routes, schemas, auth requirements), see the
interactive Swagger UI at `http://localhost:8000/docs`.
