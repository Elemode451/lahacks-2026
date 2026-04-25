"""Pydantic models for API request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Shared ──────────────────────────────────────────────────────────────────


class SongInfo(BaseModel):
    song_id: str
    spotify_id: str | None = None
    title: str
    artist: str
    album_art_url: str | None = None
    preview_url: str | None = None


class RegionScores(BaseModel):
    auditory: float = 0.0
    superior_temporal: float = 0.0
    temporo_parietal: float = 0.0
    inferior_frontal: float = 0.0
    multisensory: float = 0.0
    whole_cortex: float = 0.0


class SimilarityComponents(BaseModel):
    """Breakdown of the weighted similarity score."""
    global_score: float = 0.0
    temporal_arc: float = 0.0
    peak: float = 0.0


class RegionDifference(BaseModel):
    region: str
    left: float
    right: float
    difference: float


class SongMatch(BaseModel):
    song: SongInfo
    similarity_score: float
    components: SimilarityComponents | None = None
    matching_regions: list[str] = []


# ── Creator Mode ────────────────────────────────────────────────────────────


class CreatorAnalyzeRequest(BaseModel):
    title: str = "Untitled"
    artist: str = "Unknown"


class CreatorAnalyzeResponse(BaseModel):
    analysis_id: str
    song: SongInfo
    fingerprint_id: str
    region_scores: RegionScores
    timeline_region_scores: list[dict[str, float]] = []
    peak_segment: int = 0
    frames: list[str] = []
    top_matches: list[SongMatch] = []
    summary: str = ""


# ── Listener / Cluster Mode ────────────────────────────────────────────────


class ClusterSong(BaseModel):
    """A song to analyze. Provide either a YouTube URL or Spotify ID (or both)."""

    spotify_id: str | None = Field(
        None,
        description="Spotify track ID (e.g. '4cOdK2wGLETKBW3PvgPWqT'). Used for metadata lookup and as cache key.",
    )
    youtube_url: str | None = Field(
        None,
        description="Full YouTube URL (e.g. 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'). Audio is downloaded from here for TRIBE inference.",
    )
    title: str | None = Field(None, description="Song title (optional, resolved from Spotify if not provided).")
    artist: str | None = Field(None, description="Artist name (optional, resolved from Spotify if not provided).")


class ClusterAnalyzeRequest(BaseModel):
    """Request body for the unified analysis endpoint.

    Submit songs in one of two ways:
    - **`songs`** — a list of 1–20 individual songs (YouTube URL or Spotify ID each)
    - **`spotify_playlist_url`** — a Spotify playlist URL; all tracks are resolved automatically

    You can combine both: playlist tracks are appended to the `songs` list.
    Songs that have been analyzed before are served from cache (instant).
    New songs require TRIBE v2 GPU inference (~30–60s per song).
    """

    songs: list[ClusterSong] = Field(
        default=[],
        description="List of individual songs to analyze.",
    )
    spotify_playlist_url: str | None = Field(
        None,
        description=(
            "Spotify playlist URL (e.g. 'https://open.spotify.com/playlist/6c0GMeXcOG8odEO2UwCprx'). "
            "All tracks in the playlist are resolved and analyzed."
        ),
    )
    title: str = Field("My Cluster", description="Optional label for this analysis.")


class PairwiseSimilarity(BaseModel):
    """Cosine similarity between two songs' brain fingerprints."""

    song_a: str = Field(..., description="song_id of the first song.")
    song_b: str = Field(..., description="song_id of the second song.")
    similarity: float = Field(..., description="Weighted similarity score (0–1). Weights: 0.5 global + 0.3 temporal arc + 0.2 peak.")
    components: SimilarityComponents | None = Field(None, description="Breakdown into global, temporal_arc, and peak sub-scores.")


class ClusterAnalyzeResponse(BaseModel):
    """Response containing aggregate brain activation data for visualization.

    ## Compression & Encoding Format

    ### Overview

    The response contains two large binary fields (`combined_fingerprint_b64`
    and `temporal_fingerprints_b64`) alongside small JSON fields. The binary
    fields use a specific encoding pipeline:

    ```
    numpy float32 array
      → .tobytes()          (raw little-endian IEEE 754 float32, 4 bytes per value)
      → base64.b64encode()  (ASCII-safe string, ~33% size overhead)
      → JSON string field   (transmitted in the JSON response body)
      → HTTP gzip           (server compresses the entire JSON response)
    ```

    ### Size Breakdown

    | Field | Raw binary | Base64 string | After HTTP gzip |
    |---|---|---|---|
    | `combined_fingerprint_b64` | 81,936 bytes (20,484 × 4) | ~109 KB | ~20–40 KB |
    | `temporal_fingerprints_b64` | 2,458,080 bytes (30 × 20,484 × 4) | ~3.2 MB | ~500 KB–1 MB |
    | Other JSON fields | — | ~5 KB | ~2 KB |
    | **Total response** | — | **~3.3 MB** | **~500 KB–1 MB** |

    The base64 strings are NOT individually gzipped — they are raw float32
    bytes encoded as base64. The HTTP response itself is gzip-compressed by
    the server (via the `Accept-Encoding: gzip` header), which compresses
    the entire JSON body including the base64 strings.

    ### Byte Layout

    **`combined_fingerprint_b64`** — flat array of 20,484 little-endian float32:
    ```
    [vertex_0: 4 bytes] [vertex_1: 4 bytes] ... [vertex_20483: 4 bytes]
    ```

    **`temporal_fingerprints_b64`** — 30 segments packed contiguously:
    ```
    [segment_0: 20484 × 4 bytes] [segment_1: 20484 × 4 bytes] ... [segment_29: 20484 × 4 bytes]
    ```
    Total: 30 × 20,484 × 4 = 2,458,080 bytes → ~3,277,440 base64 characters.

    ### Decoding in JavaScript

    ```js
    // Combined fingerprint — 20,484 floats (one per cortical vertex)
    const fpBytes = Uint8Array.from(
      atob(data.combined_fingerprint_b64), c => c.charCodeAt(0)
    );
    const vertices = new Float32Array(fpBytes.buffer);
    // vertices.length === 20484
    // Map each vertex value to a color on your brain mesh (e.g. hot colormap)

    // Temporal fingerprints — 30 segments × 20,484 floats for scrubbing
    const tempBytes = Uint8Array.from(
      atob(data.temporal_fingerprints_b64), c => c.charCodeAt(0)
    );
    const allSegments = new Float32Array(tempBytes.buffer);
    // allSegments.length === 30 * 20484 = 614520
    // To get segment i:
    const VERTICES = 20484;
    const segmentI = allSegments.slice(i * VERTICES, (i + 1) * VERTICES);
    ```

    ### Decoding in Python

    ```python
    import base64, numpy as np

    # Combined fingerprint
    fp = np.frombuffer(base64.b64decode(data["combined_fingerprint_b64"]),
                       dtype=np.float32)  # shape: (20484,)

    # Temporal fingerprints
    temporal = np.frombuffer(base64.b64decode(data["temporal_fingerprints_b64"]),
                             dtype=np.float32).reshape(30, 20484)
    # temporal[i] = vertex activations for segment i
    ```

    ## Brain Regions

    The fsaverage5 mesh has ~20,484 cortical vertices. Key region vertex ranges:
    - **auditory**: vertices 3000–4500
    - **superior_temporal**: vertices 4500–6500
    - **temporo_parietal**: vertices 6500–8000
    - **inferior_frontal**: vertices 8000–9200
    - **multisensory**: vertices 9200–10242

    ## Timeline (for scrubbing)

    `combined_timeline` contains exactly 30 resampled time segments. Each
    segment is a dict mapping region name → activation score (float). Use
    this to render a timeline chart the user can scrub through. When the user
    scrubs to position `i`, update the brain mesh with `temporal_fingerprints[i]`
    (the i-th slice of the decoded `temporal_fingerprints_b64`). The indices
    match 1:1: `combined_timeline[i]` summarizes the same time window as
    `temporal_fingerprints_b64` segment `i`.

    `peak_segment` indicates which of the 30 segments has the strongest
    overall brain activation — useful for auto-seeking to the most
    interesting moment.
    """

    analysis_id: str = Field(..., description="Unique ID for this analysis.")
    songs: list[SongInfo] = Field(default=[], description="Metadata for each successfully analyzed song.")
    combined_fingerprint_b64: str = Field(
        default="",
        description=(
            "Base64-encoded float32 array of shape (20484,). "
            "The aggregate brain fingerprint averaged across all songs. "
            "Decode to Float32Array in JS for vertex coloring on the brain mesh."
        ),
    )
    temporal_fingerprints_b64: str = Field(
        default="",
        description=(
            "Base64-encoded float32 array of shape (30, 20484). "
            "30 resampled time-segment fingerprints for scrubbing. "
            "Total: 30 × 20,484 = 614,520 floats. "
            "Slice at i*20484 to get segment i's vertex activations."
        ),
    )
    combined_region_scores: RegionScores = Field(
        default_factory=RegionScores,
        description="Per-region activation scores derived from the combined fingerprint.",
    )
    combined_timeline: list[dict[str, float]] = Field(
        default=[],
        description=(
            "30 resampled time segments, each a dict of region → activation score. "
            "Use for rendering the timeline scrubbing chart. "
            "Keys: auditory, superior_temporal, temporo_parietal, inferior_frontal, multisensory, whole_cortex."
        ),
    )
    peak_segment: int = Field(
        default=0,
        description="Index (0–29) of the temporal segment with the strongest brain activation.",
    )
    vibe_description: str = Field(
        default="",
        description="Human-readable interpretation of the brain activation pattern (e.g. 'Strong auditory engagement...').",
    )
    pairwise_similarities: list[PairwiseSimilarity] = Field(
        default=[],
        description="Pairwise similarity scores between songs. Only populated when >1 song is submitted.",
    )
    summary: str = Field(
        default="",
        description="Short text summary of the analysis results.",
    )


# ── Recommendations ────────────────────────────────────────────────────────


class RecommendRequest(BaseModel):
    """Request for song recommendations based on brain-response similarity.

    Provide either a YouTube URL or Spotify ID of the target song (must have
    been analyzed previously via `/clusters/analyze`). The engine compares
    the target's brain fingerprint against all cached songs and returns the
    top-N most similar by cortical response.
    """

    youtube_url: str | None = Field(
        None,
        description="YouTube URL of the target song (must already be in the cache).",
    )
    spotify_id: str | None = Field(
        None,
        description="Spotify track ID of the target song (must already be in the cache).",
    )
    n: int = Field(
        10,
        ge=1,
        le=50,
        description="Number of recommendations to return (default 10, max 50).",
    )


class RecommendResponse(BaseModel):
    """Recommendations ranked by brain-response similarity.

    Each recommendation includes a similarity score (0–1) computed as
    cosine similarity on the 6 brain-region activation values
    (auditory, superior_temporal, temporo_parietal, inferior_frontal,
    multisensory, whole_cortex).

    Higher scores mean the song activates similar brain regions.
    """

    target: SongInfo | None = Field(
        None,
        description="The target song that recommendations are based on.",
    )
    catalog_size: int = Field(
        0,
        description="Total number of songs in the cached catalog.",
    )
    recommendations: list[SongMatch] = Field(
        default=[],
        description="Top-N most similar songs, ranked by brain-response similarity.",
    )


# ── Compare ─────────────────────────────────────────────────────────────────


class CompareRequest(BaseModel):
    fingerprint_ids: list[str] = Field(..., min_length=2, max_length=2)


class CompareResponse(BaseModel):
    left_song: SongInfo | None = None
    right_song: SongInfo | None = None
    similarity_score: float
    similarity_label: str = ""  # "high" | "moderate" | "low"
    components: SimilarityComponents
    matching_regions: list[str] = []
    largest_differences: list[RegionDifference] = []
    summary: str = ""


# ── Analyses (saved) ───────────────────────────────────────────────────────


class AnalysisSummary(BaseModel):
    analysis_id: str
    kind: str  # "creator" | "listener_cluster"
    title: str
    created_at: datetime | None = None
    share_slug: str | None = None


class AnalysisDetail(BaseModel):
    analysis_id: str
    kind: str
    title: str
    payload: dict  # full result JSON
    created_at: datetime | None = None
    share_slug: str | None = None


class ShareResponse(BaseModel):
    share_url: str
    share_slug: str


# ── Spotify Search ──────────────────────────────────────────────────────────


class SpotifySearchResult(BaseModel):
    spotify_id: str
    title: str
    artist: str
    album: str | None = None
    album_art_url: str | None = None
    preview_url: str | None = None


class SpotifySearchResponse(BaseModel):
    results: list[SpotifySearchResult] = []


# ── Auth ────────────────────────────────────────────────────────────────────


class SignUpRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    user_id: str
    email: str
    display_name: str = ""
