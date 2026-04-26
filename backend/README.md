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

## Frontend Integration Guide

All endpoints return JSON. Auth is via `Authorization: Bearer <supabase_jwt>` header.
Interactive API docs are always available at `http://localhost:8000/docs`.

### Authentication

```js
// After Supabase login, get the JWT:
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Include in requests that need auth:
const headers = {
  'Content-Type': 'application/json',
  ...(token && { Authorization: `Bearer ${token}` }),
};
```

### 1. Analyze Songs (Batch — wait for all)

```js
const resp = await fetch('/clusters/analyze', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    // Option A: individual songs
    songs: [
      { youtube_url: 'https://www.youtube.com/watch?v=abc123' },
      { spotify_id: '4sj7tIUtB4JRCnoelaYjrP' },
      { spotify_id: '3AJwUDP919kvQ9QcozQPxg', title: 'Yellow', artist: 'Coldplay' },
    ],
    // Option B: Spotify playlist
    spotify_playlist_url: 'https://open.spotify.com/playlist/1jkkBqAmaNG531r5jyq5Ov',
  }),
});
const data = await resp.json();
// data.songs — array of {song_id, title, artist, spotify_id}
// data.combined_fingerprint_b64 — base64 encoded Float32Array (20,484 vertices)
// data.temporal_fingerprints_b64 — base64 encoded 30 × 20,484 floats for timeline
// data.combined_region_scores — {auditory, superior_temporal, ...}
// data.combined_timeline — array of 30 segment scores for timeline chart
// data.vibe_description — human-readable summary
// data.pairwise_similarities — song-to-song similarity scores
```

### 2. Analyze Songs (Streaming — real-time per-song progress)

**Recommended for playlists.** Uses Server-Sent Events so the UI updates as each song finishes.

```js
async function analyzeWithProgress(requestBody, onProgress, onComplete, onError) {
  const resp = await fetch('/clusters/analyze/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
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
    buffer = lines.pop(); // keep incomplete line in buffer

    let eventType = null;
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('data: ') && eventType) {
        const data = JSON.parse(line.slice(6));
        switch (eventType) {
          case 'progress':
            // { song: "Coldplay - Yellow", index: 3, total: 12, status: "analyzing" }
            // status: "starting" | "downloading" | "analyzing"
            onProgress(data);
            break;
          case 'song_complete':
            // { song: "Coldplay - Yellow", index: 3, total: 12, cached: false }
            onProgress({ ...data, status: 'complete' });
            break;
          case 'song_error':
            // { song: "...", index: 3, total: 12, error: "No audio source found" }
            onProgress({ ...data, status: 'error' });
            break;
          case 'complete':
            // Full ClusterAnalyzeResponse (same shape as /clusters/analyze)
            onComplete(data);
            break;
          case 'error':
            // { message: "..." }
            onError(data.message);
            break;
        }
        eventType = null;
      }
    }
  }
}

// Usage:
analyzeWithProgress(
  { spotify_playlist_url: 'https://open.spotify.com/playlist/...' },
  (progress) => {
    console.log(`[${progress.index}/${progress.total}] ${progress.song}: ${progress.status}`);
    // Update progress bar / song list UI
  },
  (result) => {
    console.log('All done!', result);
    // Render brain visualization with result.combined_fingerprint_b64
  },
  (error) => console.error('Fatal error:', error),
);
```

**SSE Event Reference:**

| Event | Shape | When |
|-------|-------|------|
| `progress` | `{song, index, total, status}` | Song starts processing. `status`: `"starting"`, `"downloading"`, `"analyzing"` |
| `song_complete` | `{song, index, total, cached}` | Song finished. `cached: true` = instant (was in Supabase) |
| `song_error` | `{song, index, total, error}` | Song failed (skipped, continues to next) |
| `complete` | Full `ClusterAnalyzeResponse` | All songs done. Same JSON shape as `POST /clusters/analyze` |
| `error` | `{message}` | Fatal error (no results) |

### 3. Decode Brain Data (Vertex Fingerprints)

```js
// Decode the base64 fingerprint into a Float32Array
function decodeFingerprintB64(b64String) {
  const bytes = Uint8Array.from(atob(b64String), c => c.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

// Combined fingerprint: 20,484 floats (one per cortical vertex)
const vertices = decodeFingerprintB64(data.combined_fingerprint_b64);
// vertices[i] → activation intensity for vertex i on the fsaverage5 brain mesh

// Temporal fingerprints: 30 segments × 20,484 floats (for timeline scrubbing)
const allSegments = decodeFingerprintB64(data.temporal_fingerprints_b64);
// Segment i: allSegments.slice(i * 20484, (i + 1) * 20484)
```

### 4. Recommendations — Brain Similarity

```js
// Find songs that sound similar (same brain activation patterns)
const resp = await fetch('/recommendations/similar', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    youtube_url: 'https://www.youtube.com/watch?v=abc123',
    // OR spotify_id: '3AJwUDP919kvQ9QcozQPxg',
    n: 10,  // number of results (max 50)
    exclude_previously_recommended: true,  // requires auth
  }),
});
const data = await resp.json();
// data.target — {song_id, title, artist} of the input song
// data.catalog_size — total songs in the database
// data.recommendations — array of:
//   {
//     song: {song_id, title, artist},
//     similarity_score: 0.92,        // 0–1, higher = more similar
//     matching_regions: ["auditory"], // regions with near-identical activation
//     source: "brain_similarity",
//   }
```

### 5. Recommendations — Collaborative ("Users like you also like")

```js
// Requires auth. Finds users who analyzed the same songs, shows what else they analyzed.
const resp = await fetch('/recommendations/collaborative?n=10', {
  method: 'POST',
  headers,  // must include Authorization
});
const data = await resp.json();
// data.recommendations — array of:
//   {
//     song: {song_id, title, artist},
//     similarity_score: 0.75,  // frequency ratio (what fraction of similar users analyzed this)
//     source: "collaborative",
//   }
// data.similar_user_count — number of users with overlapping taste
```

### 6. Recommendation History

```js
// Get previously recommended songs (for showing "already suggested" in UI)
const history = await fetch('/recommendations/history', { headers }).then(r => r.json());
// history.songs — array of SongMatch objects
// history.total — count of unique songs recommended

// Clear history (user wants fresh recommendations)
await fetch('/recommendations/history', { method: 'DELETE', headers });
```

### 7. Spotify Search

```js
const resp = await fetch('/spotify/search?q=coldplay+yellow');
const data = await resp.json();
// data.tracks — array of {spotify_id, title, artist, album, album_art_url}
```

### 8. Auth (Signup / Login)

```js
// Signup
const resp = await fetch('/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
});

// Login
const resp = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
});
const data = await resp.json();
// data.access_token — use as Bearer token for authenticated endpoints
// data.user — {id, email}
```

### Response Sizes

| Endpoint | Typical Response | Gzipped |
|----------|-----------------|---------|
| `/clusters/analyze` (1 song) | ~110 KB | ~30 KB |
| `/clusters/analyze` (12 songs) | ~3.3 MB | ~500 KB |
| `/recommendations/similar` | ~2 KB | ~500 B |
| `/recommendations/collaborative` | ~2 KB | ~500 B |
| `/spotify/search` | ~5 KB | ~1 KB |
