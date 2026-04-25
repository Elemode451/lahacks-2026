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


class SongMatch(BaseModel):
    song: SongInfo
    similarity_score: float
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
    frames: list[str] = []
    top_matches: list[SongMatch] = []
    summary: str = ""


# ── Listener / Cluster Mode ────────────────────────────────────────────────


class ClusterSong(BaseModel):
    """A song in a listener cluster, identified by Spotify ID or YouTube URL."""
    spotify_id: str | None = None
    youtube_url: str | None = None
    title: str | None = None
    artist: str | None = None


class ClusterAnalyzeRequest(BaseModel):
    songs: list[ClusterSong] = Field(..., min_length=2, max_length=10)
    title: str = "My Cluster"


class PairwiseSimilarity(BaseModel):
    song_a: str
    song_b: str
    similarity: float


class ClusterAnalyzeResponse(BaseModel):
    analysis_id: str
    coherence_score: float
    coherence_label: str  # "strong" | "moderate" | "eclectic"
    songs: list[SongInfo] = []
    pairwise_similarities: list[PairwiseSimilarity] = []
    odd_one_out: SongInfo | None = None
    recommendations: list[SongMatch] = []
    frames: list[str] = []
    summary: str = ""


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
    similarity_score: float
    region_comparison: dict[str, dict[str, float]] = {}
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
