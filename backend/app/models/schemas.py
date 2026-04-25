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

    Submit 1–20 songs. Each song needs at least a `youtube_url` or `spotify_id`.
    Songs that have been analyzed before are served from cache (instant).
    New songs require TRIBE v2 GPU inference (~30–60s per song).
    """

    songs: list[ClusterSong] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="List of songs to analyze. At least one required.",
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

    ## Data Format

    ### Vertex Data (base64-encoded raw float32 bytes)

    Two fields contain the full cortical vertex activation data for 3D brain
    rendering. Both are **base64-encoded raw little-endian float32 bytes** (NOT
    gzipped — the HTTP response itself is gzip-compressed by the server).

    **Decoding in JavaScript:**
    ```js
    // Combined fingerprint — 20,484 floats (one per cortical vertex)
    const fpBytes = Uint8Array.from(atob(data.combined_fingerprint_b64), c => c.charCodeAt(0));
    const vertices = new Float32Array(fpBytes.buffer);
    // vertices.length === 20484
    // Map each vertex value to a color on your brain mesh (e.g. hot colormap)

    // Temporal fingerprints — 30 segments × 20,484 floats for scrubbing
    const tempBytes = Uint8Array.from(atob(data.temporal_fingerprints_b64), c => c.charCodeAt(0));
    const allSegments = new Float32Array(tempBytes.buffer);
    // allSegments.length === 30 * 20484 = 614520
    // To get segment i: allSegments.slice(i * 20484, (i + 1) * 20484)
    ```

    ### Brain Regions

    The fsaverage5 mesh has ~20,484 cortical vertices. Key region vertex ranges:
    - **auditory**: vertices 3000–4500
    - **superior_temporal**: vertices 4500–6500
    - **temporo_parietal**: vertices 6500–8000
    - **inferior_frontal**: vertices 8000–9200
    - **multisensory**: vertices 9200–10242

    ### Timeline (for scrubbing)

    `combined_timeline` contains 30 resampled time segments. Each segment has
    per-region activation scores. Use this to render a timeline chart that the
    user can scrub through. When the user scrubs to position `i`, update the
    brain mesh with `temporal_fingerprints[i]` (the i-th slice of the decoded
    `temporal_fingerprints_b64`).
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
    fingerprint_id: str
    n: int = 20


class RecommendResponse(BaseModel):
    recommendations: list[SongMatch] = []


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
