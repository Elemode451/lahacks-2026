"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, Send, LogOut, Clock, Music, Brain, MessageCircle, Radio } from "lucide-react";
import {
  SeratoneLogo,
  SoundBarsIcon,
  FileIcon,
  SpotifyIcon,
  YouTubeIcon,
  UploadIcon,
} from "@/components/Icons";
import ColorBends, { type ColorBendsHandle } from "@/components/ColorBends";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { RecommendedSong } from "@/components/SongRecommendations";

const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
});
const MusicRadarChart = dynamic(() => import("@/components/MusicRadarChart"), {
  ssr: false,
});
const AudioTimeline = dynamic(() => import("@/components/AudioTimeline"), {
  ssr: false,
});
const ChatInterface = dynamic(() => import("@/components/ChatInterface"), {
  ssr: false,
});
const SongRecommendations = dynamic(() => import("@/components/SongRecommendations"), {
  ssr: false,
});
const KeyInfoDisplay = dynamic(() => import("@/components/KeyInfo"), {
  ssr: false,
});
const EmotionalProfile = dynamic(() => import("@/components/EmotionalProfile"), {
  ssr: false,
});

type ViewState = "intro" | "importing" | "analyzing" | "processing" | "analysis";
type ImportType = "file" | "spotify" | "youtube";

const panelEase = [0.16, 1, 0.3, 1] as const;
const TOPBAR_H = 93;

export default function Home() {
  const { user, loading, displayName, signOut, session } = useAuth();
  const router = useRouter();

  const [viewState, setViewState] = useState<ViewState>("intro");
  const [importType, setImportType] = useState<ImportType>("file");
  const [songs, setSongs] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [brainFlashing, setBrainFlashing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorBendsRef = useRef<ColorBendsHandle>(null);
  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(832);

  // Processing state for real API calls
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);

  // Analysis results from API
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);

  // Timeline scrubbing segment index
  const [currentSegment, setCurrentSegment] = useState(0);

  // Saved creator analyses
  interface SavedAnalysis {
    analysis_id: string;
    kind: string;
    title: string;
    created_at: string | null;
  }
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);

  // Recommendation state
  const [recommendations, setRecommendations] = useState<RecommendedSong[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const seenSongIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Fetch saved creator analyses on mount
  useEffect(() => {
    if (!session?.access_token) return;
    apiFetch("/creator/analyses", {}, session.access_token)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SavedAnalysis[]) => setSavedAnalyses(data))
      .catch(() => {});
  }, [session?.access_token]);

  const handleViewSavedAnalysis = useCallback(async (analysisId: string) => {
    const token = session?.access_token ?? null;
    try {
      const res = await apiFetch(`/analyses/${analysisId}`, {}, token);
      if (!res.ok) return;
      const detail = await res.json();
      if (detail.payload) {
        setAnalysisResult(detail.payload);
        setViewState("analysis");
      }
    } catch {
      // ignore
    }
  }, [session]);

  // Close EventSource on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Decode base64 → Float32Array
  function decodeB64Float32(b64: string): Float32Array | null {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Float32Array(bytes.buffer);
    } catch {
      return null;
    }
  }

  // Derive fingerprint data from analysisResult (no setState in effect)
  const fingerprint = useMemo(() => {
    const b64 = analysisResult?.combined_fingerprint_b64 as string | undefined;
    return b64 ? decodeB64Float32(b64) : null;
  }, [analysisResult]);

  const temporalData = useMemo(() => {
    const b64 = analysisResult?.temporal_fingerprints_b64 as string | undefined;
    return b64 ? decodeB64Float32(b64) : null;
  }, [analysisResult]);

  // Extract timeline activations for AudioTimeline bar heights
  const timelineActivations = useMemo(() => {
    const timeline = analysisResult?.combined_timeline as
      | Array<Record<string, number>>
      | undefined;
    if (!timeline || timeline.length === 0) return undefined;
    return timeline.map((seg) => seg.whole_cortex ?? 0);
  }, [analysisResult]);

  // Extract region scores for MusicRadarChart
  const radarData = useMemo(() => {
    const scores = analysisResult?.combined_region_scores as
      | Record<string, number>
      | undefined;
    if (!scores) return undefined;
    const entries = [
      { attribute: "Auditory", value: scores.auditory ?? 0 },
      { attribute: "Sup. Temporal", value: scores.superior_temporal ?? 0 },
      { attribute: "Temp.-Parietal", value: scores.temporo_parietal ?? 0 },
      { attribute: "Inf. Frontal", value: scores.inferior_frontal ?? 0 },
      { attribute: "Multisensory", value: scores.multisensory ?? 0 },
      { attribute: "Whole Cortex", value: scores.whole_cortex ?? 0 },
    ];
    const max = Math.max(...entries.map((e) => e.value));
    if (max === 0) return undefined;
    const min = Math.min(...entries.map((e) => e.value));
    const range = max - min;
    if (range === 0) {
      // All regions identical — show uniform mid-level
      return entries.map((e) => ({ attribute: e.attribute, value: 50 }));
    }
    // Min-max scale to 15–100 so the shape has clear peaks and valleys
    return entries.map((e) => ({
      attribute: e.attribute,
      value: Math.round(15 + ((e.value - min) / range) * 85),
    }));
  }, [analysisResult]);

  const peakSegment = (analysisResult?.peak_segment as number | undefined) ?? undefined;

  const topMatches = useMemo(() => {
    if (!analysisResult) return undefined;
    const matches = analysisResult.top_matches as Array<{
      song: { title: string; artist: string };
      similarity_score: number;
      matching_regions?: string[];
    }> | undefined;
    if (!matches || matches.length === 0) return undefined;
    return matches.map((m) => ({
      title: m.song.title,
      artist: m.song.artist,
      tag: m.matching_regions?.[0]?.replace(/_/g, " ") ?? `${Math.round(m.similarity_score * 100)}% match`,
    }));
  }, [analysisResult]);

  const layout = useMemo(() => {
    const contentH = vh - TOPBAR_H;
    const halfW = vw * 0.5;
    const brainSize = Math.min(contentH * 0.95, halfW);
    return {
      brainW: brainSize,
      brainH: brainSize,
      brainIntroX: (vw - brainSize) / 2,
      brainAnalysisX: (halfW - brainSize) / 2,
      brainTop: TOPBAR_H + (contentH - brainSize) / 2,
      pillW: 140,
      pillH: 50,
      pillX: vw * 0.7,
      pillY: TOPBAR_H - 25,
      panelW: Math.min(vw * 0.72, 920),
      panelH: Math.min(contentH * 0.88, 650),
      panelX: (vw - Math.min(vw * 0.72, 920)) / 2,
      panelY: TOPBAR_H + (contentH - Math.min(contentH * 0.88, 650)) / 2,
      rightPanelW: halfW,
    };
  }, [vw, vh]);

  const handleAddSong = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim()) {
      setSongs([...songs, inputValue.trim()]);
      setInputValue("");
    }
  };

  const handleRemoveSong = (index: number) => {
    setSongs(songs.filter((_, i) => i !== index));
  };

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList) return;
    const audio = Array.from(fileList).filter(
      (f) => f.type.startsWith("audio/") || /\.(mp3|wav|flac|aac|ogg|m4a|wma)$/i.test(f.name)
    );
    if (audio.length) setUploadedFiles((prev) => [...prev, ...audio]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const canAnalyze = importType === "file" ? uploadedFiles.length > 0 : songs.length > 0;

  const cancelAnalyzeTimeout = () => {
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
      analyzeTimeoutRef.current = null;
    }
  };

  const resetState = () => {
    cancelAnalyzeTimeout();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setBrainFlashing(false);
    setViewState("intro");
    setProcessingStatus("");
    setProcessingProgress(0);
    setProcessingTotal(0);
    setAnalysisResult(null);
    setCurrentSegment(0);
    setSongs([]);
    setUploadedFiles([]);
    setInputValue("");
    setRecommendations([]);
    setRecsLoading(false);
    seenSongIdsRef.current.clear();
  };

  // Fetch recommendations for a given song identifier
  const fetchRecommendations = useCallback(
    async (songId: string) => {
      setRecsLoading(true);
      const token = session?.access_token ?? null;

      try {
        const isSpotify = songId.startsWith("spotify:");
        const body: Record<string, unknown> = {
          n: 10,
          exclude_previously_recommended: true,
        };
        if (isSpotify) {
          body.spotify_id = songId.replace("spotify:", "");
        } else {
          body.youtube_url = songId;
        }

        const similarRes = await apiFetch(
          "/recommendations/similar",
          { method: "POST", body: JSON.stringify(body) },
          token,
        );

        let similarSongs: RecommendedSong[] = [];
        if (similarRes.ok) {
          const data = await similarRes.json();
          similarSongs = (data.recommendations ?? []).map(
            (r: { song: { song_id: string; title: string; artist: string }; similarity_score: number; source: string }) => ({
              song_id: r.song.song_id,
              title: r.song.title,
              artist: r.song.artist,
              similarity_score: r.similarity_score,
              source: r.source ?? "brain_similarity",
            }),
          );
        }

        let collabSongs: RecommendedSong[] = [];
        if (token) {
          const collabRes = await apiFetch(
            "/recommendations/collaborative",
            { method: "POST", body: JSON.stringify({ n: 10 }) },
            token,
          );
          if (collabRes.ok) {
            const data = await collabRes.json();
            collabSongs = (data.recommendations ?? []).map(
              (r: { song: { song_id: string; title: string; artist: string }; similarity_score: number; source: string }) => ({
                song_id: r.song.song_id,
                title: r.song.title,
                artist: r.song.artist,
                similarity_score: r.similarity_score,
                source: r.source ?? "collaborative",
              }),
            );
          }
        }

        // Blend: brain-similar first, then collaborative, deduplicated
        const seen = seenSongIdsRef.current;
        const blended: RecommendedSong[] = [];
        for (const song of [...similarSongs, ...collabSongs]) {
          if (!seen.has(song.song_id)) {
            seen.add(song.song_id);
            blended.push(song);
          }
        }

        setRecommendations((prev) => {
          const existingIds = new Set(prev.map((s) => s.song_id));
          const newSongs = blended.filter((s) => !existingIds.has(s.song_id));
          return [...prev, ...newSongs];
        });
      } catch (err) {
        console.error("Failed to fetch recommendations:", err);
      } finally {
        setRecsLoading(false);
      }
    },
    [session],
  );

  // Handle clicking a recommended song — trigger analysis for it
  const handleRecommendedSongClick = useCallback(
    (song: RecommendedSong) => {
      const songId = song.song_id;
      const isSpotify = songId.startsWith("spotify:");

      if (isSpotify) {
        const spotifyId = songId.replace("spotify:", "");
        const url = `https://open.spotify.com/track/${spotifyId}`;
        setSongs((prev) => [...prev, url]);
      } else {
        setSongs((prev) => [...prev, songId]);
      }

      setImportType(songId.startsWith("spotify:") ? "spotify" : "youtube");
    },
    [],
  );

  // Refresh recommendations
  const handleRefreshRecommendations = useCallback(() => {
    const result = analysisResult;
    if (!result) return;

    // Creator mode: re-populate from top_matches (cache key mismatch prevents API call)
    const topMatches = (result as Record<string, unknown>).top_matches as Array<{
      song: { song_id: string; title: string; artist: string };
      similarity_score: number;
      source?: string;
    }> | undefined;
    if (topMatches?.length) {
      setRecommendations(
        topMatches.map((m) => ({
          song_id: m.song.song_id,
          title: m.song.title,
          artist: m.song.artist,
          similarity_score: m.similarity_score,
          source: m.source ?? "brain_similarity",
        })),
      );
      return;
    }

    // Listener/cluster mode: fetch via API
    const analyzedSongs = (result as Record<string, unknown>).songs as Array<{ song_id?: string; spotify_id?: string }> | undefined;
    if (analyzedSongs?.length) {
      const first = analyzedSongs[0];
      const cacheKey = first.spotify_id
        ? `spotify:${first.spotify_id}`
        : first.song_id;
      if (cacheKey) {
        fetchRecommendations(cacheKey);
      }
    }
  }, [analysisResult, fetchRecommendations]);

  // ── Real API: Creator Mode (file upload) ──
  const handleCreatorAnalyze = useCallback(async () => {
    if (uploadedFiles.length === 0) return;

    cancelAnalyzeTimeout();
    setBrainFlashing(true);
    setViewState("processing");
    setProcessingStatus("Uploading and analyzing your track...");
    setProcessingProgress(0);
    setProcessingTotal(uploadedFiles.length);

    try {
      const file = uploadedFiles[0];
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("title", file.name.replace(/\.[^.]+$/, ""));
      formData.append("artist", "Unknown");

      const res = await apiFetch(
        "/creator/analyze",
        { method: "POST", body: formData },
        session?.access_token ?? null,
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const result = await res.json();
      setAnalysisResult(result);
      setProcessingProgress(1);
      setBrainFlashing(false);
      setViewState("analysis");

      // Populate recommendations directly from top_matches in the response
      // (creator mode uses upload:{hash} cache keys which don't match song_id,
      //  so we can't call fetchRecommendations — use the already-computed matches)
      const topMatches = result.top_matches as Array<{
        song: { song_id: string; title: string; artist: string };
        similarity_score: number;
        source?: string;
      }> | undefined;
      if (topMatches?.length) {
        setRecommendations(
          topMatches.map((m) => ({
            song_id: m.song.song_id,
            title: m.song.title,
            artist: m.song.artist,
            similarity_score: m.similarity_score,
            source: m.source ?? "brain_similarity",
          })),
        );
      }
    } catch (err) {
      setProcessingStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setBrainFlashing(false);
      setViewState("importing");
    }
  }, [uploadedFiles, session]);

  // ── Real API: Listener Mode (Spotify/YouTube links) ──
  const handleListenerAnalyze = useCallback(async () => {
    if (songs.length === 0) return;

    cancelAnalyzeTimeout();
    setBrainFlashing(true);
    setViewState("processing");
    setProcessingStatus("Submitting songs for analysis...");
    setProcessingProgress(0);
    setProcessingTotal(0);

    try {
      const clusterSongs = songs.map((url) => {
        if (url.includes("spotify.com") || url.includes("spotify:")) {
          const match = url.match(/track\/([a-zA-Z0-9]+)/);
          if (match) return { spotify_id: match[1] };
          return { youtube_url: url };
        }
        return { youtube_url: url };
      });

      const isPlaylistUrl =
        songs.length === 1 && songs[0].includes("spotify.com/playlist");

      const body: Record<string, unknown> = {};
      if (isPlaylistUrl) {
        body.spotify_playlist_url = songs[0];
      } else {
        body.songs = clusterSongs;
      }
      body.title = "My Analysis";

      const token = session?.access_token ?? null;
      const res = await apiFetch(
        "/clusters/analyze/stream",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      // Parse SSE events from the streaming POST response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      const processEvents = (text: string) => {
        buffer += text;
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          let eventType = "";
          const dataLines: string[] = [];
          for (const line of part.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
            else if (line.startsWith("data:")) dataLines.push(line.slice(5));
          }
          const eventData = dataLines.join("\n");
          if (!eventType || !eventData) continue;
          try {
            const data = JSON.parse(eventData);
            if (eventType === "song_complete") {
              setProcessingProgress(data.index);
              setProcessingTotal(data.total);
              setProcessingStatus(`Analyzed ${data.index}/${data.total}: ${data.song}`);
            } else if (eventType === "song_error") {
              setProcessingStatus(`Error on ${data.song}: ${data.error}`);
            } else if (eventType === "complete") {
              setAnalysisResult(data);
              setBrainFlashing(false);
              setViewState("analysis");
              // Fetch recommendations for the first analyzed song
              const analyzedSongs = data.songs as Array<{ song_id?: string; spotify_id?: string }> | undefined;
              if (analyzedSongs?.length) {
                const first = analyzedSongs[0];
                const cacheKey = first.spotify_id
                  ? `spotify:${first.spotify_id}`
                  : first.song_id;
                if (cacheKey) {
                  fetchRecommendations(cacheKey);
                }
              }
            } else if (eventType === "error") {
              setProcessingStatus(`Analysis failed: ${data?.message ?? "Unknown error"}`);
              setBrainFlashing(false);
              setViewState("importing");
            }
          } catch (e) {
            console.error("SSE parse error for event:", eventType, e);
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        processEvents(decoder.decode(value, { stream: true }));
      }
      // Process any remaining buffer
      if (buffer.trim()) processEvents(buffer + "\n\n");

      // Fallback: if stream ended without a complete/error event, reset UI
      setViewState((cur) => {
        if (cur === "processing") {
          setBrainFlashing(false);
          setProcessingStatus("Stream ended unexpectedly. Please try again.");
          return "importing";
        }
        return cur;
      });
    } catch (err) {
      setProcessingStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setBrainFlashing(false);
      setViewState("importing");
    }
  }, [songs, session, fetchRecommendations]);

  // Wire the analyze button to the right handler based on importType
  const handleAnalyze = () => {
    if (!canAnalyze) return;
    if (importType === "file") {
      handleCreatorAnalyze();
    } else {
      handleListenerAnalyze();
    }
  };

  useEffect(() => () => cancelAnalyzeTimeout(), []);

  // Build overview text from analysis result, enriched with brain regions and emotions
  const overviewText = useMemo(() => {
    const fallback =
      "This music fits a limbic-dominant profile with strong auditory cortex engagement. High introspective alignment suggests deep default-mode network resonance characteristic of emotional processing music.";
    if (!analysisResult) return fallback;

    const regionLabels: Record<string, string> = {
      auditory: "auditory cortex",
      superior_temporal: "superior temporal gyrus",
      temporo_parietal: "temporo-parietal junction",
      inferior_frontal: "inferior frontal cortex",
      multisensory: "multisensory integration areas",
    };

    // Build brain-region activation sentence from the top activated regions
    const scores = (analysisResult.combined_region_scores ?? analysisResult.region_scores) as
      | Record<string, number>
      | undefined;
    let regionSentence = "";
    if (scores) {
      const ranked = Object.entries(scores)
        .filter(([k, v]) => k !== "whole_cortex" && typeof v === "number")
        .sort(([, a], [, b]) => b - a);
      const topRegions = ranked.slice(0, 3).map(([k]) => regionLabels[k] ?? k.replace(/_/g, " "));
      if (topRegions.length > 0) {
        regionSentence = `This track most strongly activates the ${topRegions.join(", ")}.`;
      }
    }

    // Emotional profile sentence
    const emotionalProfile = analysisResult.emotional_profile as
      | { summary?: string; dominant_emotions?: string[] }
      | undefined;
    let emotionSentence = "";
    if (emotionalProfile?.summary) {
      emotionSentence = emotionalProfile.summary;
    } else if (emotionalProfile?.dominant_emotions?.length) {
      const emos = emotionalProfile.dominant_emotions.map((e) => e.toLowerCase());
      const emotionList =
        emos.length <= 2
          ? emos.join(" and ")
          : `${emos.slice(0, -1).join(", ")}, and ${emos[emos.length - 1]}`;
      emotionSentence = `The primary predicted emotional responses are ${emotionList}.`;
    }

    // Compose: brain regions first (most interesting), then emotions, then vibe
    const vibe = (analysisResult.vibe_description as string | undefined) ?? "";
    const parts = [regionSentence, emotionSentence, vibe].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : fallback;
  }, [analysisResult]);

  if (loading || !user) {
    return (
      <div className="h-full flex items-center justify-center bg-[#fffdf5]">
        <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#fffdf5] font-sans selection:bg-[#f95738] selection:text-white">
      {/* Color Bends Background — starts from top so topbar slide reveals it */}
      <div className="absolute inset-0 pointer-events-none" style={{ top: 0, opacity: 0.75 }}>
        <ColorBends
          ref={colorBendsRef}
          colors={["#0D3B66"]}
          speed={0.2}
          frequency={1}
          warpStrength={1}
          scale={1}
          intensity={1.5}
          noise={0.15}
          iterations={1}
          bandWidth={1}
          transparent={true}
          mouseInfluence={0}
          parallax={0}
        />
      </div>

      {/* Topbar Background — slides up on analysis */}
      <motion.div
        className="absolute bg-[#fffdf5] left-0 top-0 w-full z-0"
        style={{ height: TOPBAR_H }}
        initial={false}
        animate={{ y: viewState === "analysis" ? -TOPBAR_H : 0 }}
        transition={{ duration: 0.8, ease: panelEase }}
      />

      {/* 3D Brain — slides left on analysis */}
      <motion.div
        className={`absolute ${viewState !== "analysis" ? "pointer-events-none" : ""} z-10 ${brainFlashing ? "brain-flash" : ""}`}
        style={{ width: layout.brainW, height: layout.brainH, top: layout.brainTop }}
        initial={{ opacity: 0, x: layout.brainIntroX }}
        animate={{
          opacity: 1,
          x: viewState === "analysis" ? layout.brainAnalysisX : layout.brainIntroX,
        }}
        transition={{
          opacity: { duration: 0.6, ease: "linear", delay: 0.4 },
          x: { duration: 0.8, ease: panelEase },
        }}
      >
        <BrainScene
          className="w-full h-full"
          flashing={brainFlashing}
          interactive={viewState === "analysis"}
          fingerprint={fingerprint}
          temporalData={temporalData}
          segmentIndex={currentSegment}
        />
      </motion.div>

      {/* Logo Group — spans left half, centered horizontally, stationary */}
      <motion.div
        className="absolute z-20 flex items-end justify-center cursor-pointer hover:opacity-80"
        style={{ left: 0, width: "50vw", top: TOPBAR_H - 41 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: "linear", delay: 0.5 }}
        onClick={resetState}
      >
        <SeratoneLogo className="h-[41px] w-auto" />
      </motion.div>

      {/* User info + sign out */}
      <div
        className="absolute top-0 right-8 z-20 flex items-center gap-3"
        style={{ height: TOPBAR_H }}
      >
        <span className="text-[#0d3b66]/45 text-sm font-medium">{displayName}</span>
        <button
          onClick={signOut}
          className="text-[#0d3b66]/25 hover:text-[#f95738] hover:bg-[rgba(249,87,56,0.06)] transition-all duration-200 cursor-pointer p-2 rounded-xl"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Right Section (Analysis View) — slides in from right */}
      <motion.div
        className="absolute bg-[#fffdf5] top-0 z-10"
        style={{ width: layout.rightPanelW, height: vh }}
        initial={false}
        animate={{
          x: viewState === "analysis" ? vw - layout.rightPanelW : vw,
        }}
        transition={{ duration: 0.8, ease: panelEase }}
      >
        <AnimatePresence>
          {viewState === "analysis" && (
            <motion.div
              className="absolute inset-0 px-8 pt-6 pb-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {/* Timeline Section */}
              <motion.div
                className="glass-card px-6 py-5 shrink-0"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5, ease: panelEase }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Radio className="w-3.5 h-3.5 text-[#0d3b66]/40" />
                  <h3 className="section-header">Timeline</h3>
                </div>
                <AudioTimeline
                  duration={214}
                  segmentActivations={timelineActivations}
                  peakIndex={peakSegment}
                  currentIndex={currentSegment}
                  onSegmentChange={setCurrentSegment}
                  className="max-w-[320px] mx-auto w-full"
                />
              </motion.div>

              {/* Radar Chart Section */}
              <motion.div
                className="glass-card px-6 py-5 shrink-0"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6, ease: panelEase }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-3.5 h-3.5 text-[#0d3b66]/40" />
                  <h3 className="section-header">Cortical Profile</h3>
                </div>
                <div className="flex justify-center">
                  <MusicRadarChart data={radarData} className="w-full max-w-[340px]" style={{ height: "min(220px, 26vh)" }} />
                </div>
              </motion.div>

              {/* Emotional Response */}
              <EmotionalProfile
                emotionalProfile={
                  analysisResult?.emotional_profile as
                    | { emotions?: { name: string; intensity: number; level: string; description: string }[]; dominant_emotions?: string[]; summary?: string }
                    | null
                    | undefined
                }
              />

              {/* Key Info */}
              <KeyInfoDisplay
                analysisResult={analysisResult}
                className="mt-3 px-1"
              />

              {/* Chat + Song Recommendations */}
              <motion.div
                className="flex-1 min-h-0 flex gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.7, ease: panelEase }}
              >
                {/* Chat Section */}
                <div className="glass-card px-5 py-4 flex-1 min-w-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-3.5 h-3.5 text-[#0d3b66]/40" />
                    <h3 className="section-header">Ask Sera</h3>
                  </div>
                  <ChatInterface
                    overview={overviewText}
                    analysisResult={analysisResult}
                    token={session?.access_token ?? null}
                    className="flex-1 min-w-0"
                  />
                </div>

                {/* Recommendations Section */}
                <div className="glass-card px-5 py-4 w-[40%] shrink-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <Music className="w-3.5 h-3.5 text-[#0d3b66]/40" />
                    <h3 className="section-header">Discover</h3>
                  </div>
                  <SongRecommendations
                    className="flex-1 min-h-0"
                    recommendations={recommendations}
                    loading={recsLoading}
                    onSongClick={handleRecommendedSongClick}
                    onRefresh={handleRefreshRecommendations}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Click Outside Overlay — dismiss importing */}
      {viewState === "importing" && (
        <div
          className="absolute inset-0 z-[15]"
          onClick={resetState}
        />
      )}

      {/* Processing overlay */}
      <AnimatePresence>
        {viewState === "processing" && (
          <motion.div
            className="absolute z-30 flex flex-col items-center justify-center bg-[#fffdf5]/90 backdrop-blur-md"
            style={{ inset: 0 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Pulsing brain icon */}
            <motion.div
              className="pulse-glow mb-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: panelEase }}
            >
              <div className="w-16 h-16 rounded-full bg-[rgba(249,87,56,0.12)] flex items-center justify-center">
                <Brain className="w-8 h-8 text-[#f95738]" />
              </div>
            </motion.div>

            <motion.p
              className="shimmer-text font-semibold text-xl tracking-tight mb-2"
              style={{ fontFamily: "var(--font-display)" }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              Analyzing your music
            </motion.p>

            <motion.p
              className="text-[#0d3b66]/40 text-sm mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Predicting cortical response patterns
            </motion.p>

            {processingTotal > 0 && (
              <motion.div
                className="w-72 mb-5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="w-full h-2.5 rounded-full bg-[rgba(249,87,56,0.1)] overflow-hidden relative">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#f95738] to-[#ee964b] relative overflow-hidden"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(processingProgress / processingTotal) * 100}%`,
                    }}
                    transition={{ duration: 0.5, ease: panelEase }}
                  >
                    <div
                      className="absolute inset-0 opacity-40"
                      style={{
                        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                        animation: "progress-shimmer 1.5s infinite",
                      }}
                    />
                  </motion.div>
                </div>
                <p className="text-[#0d3b66]/35 text-xs mt-2.5 text-center font-medium tabular-nums">
                  {processingProgress} of {processingTotal} processed
                </p>
              </motion.div>
            )}

            <motion.p
              className="text-[#0d3b66]/35 text-xs text-center max-w-sm px-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {processingStatus}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Button / Panel — spring expansion */}
      <AnimatePresence>
        {(viewState === "intro" || viewState === "importing") && (
          <motion.div
            className="absolute bg-[rgba(249,87,56,0.32)] overflow-hidden z-20 shadow-sm backdrop-blur-[40px] border border-[rgba(249,87,56,0.5)]"
            initial={false}
            animate={{
              width: viewState === "intro" ? layout.pillW : layout.panelW,
              height: viewState === "intro" ? layout.pillH : layout.panelH,
              x: viewState === "intro" ? layout.pillX : layout.panelX,
              y: viewState === "intro" ? layout.pillY : layout.panelY,
              borderRadius: viewState === "intro" ? 100 : 50,
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale: 0.95,
              transition: { duration: 0.4 },
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              mass: 1.5,
            }}
            style={{ transformOrigin: "center" }}
          >
            {viewState === "intro" ? (
              <motion.button
                className="w-full h-full flex items-center justify-center gap-3 text-[#f95738] hover:bg-[rgba(249,87,56,0.3)] transition-colors cursor-pointer"
                onClick={() => setViewState("importing")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                <span className="font-semibold text-xl tracking-[-0.8px]" style={{ fontFamily: "var(--font-display)" }}>import</span>
                <SoundBarsIcon className="size-6" />
              </motion.button>
            ) : (
              <motion.div
                className="absolute flex flex-col"
                style={{ top: "7.4%", left: "8.7%", right: "8.9%", bottom: "7.2%" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {/* Header: "import:" left, icon tabs right */}
                <div className="flex justify-between items-start">
                  <h2 className="text-[#f95738] text-[clamp(18px,2vw,26px)] tracking-[-1px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>import:</h2>
                  <div className="flex gap-[clamp(8px,1.2vw,14px)] text-[#f95738] items-center">
                    {([["file", FileIcon], ["spotify", SpotifyIcon], ["youtube", YouTubeIcon]] as const).map(([type, Icon]) => (
                      <motion.button
                        key={type}
                        className={`relative cursor-pointer p-1.5 rounded-xl transition-colors ${importType === type ? "bg-[rgba(249,87,56,0.12)]" : "hover:bg-[rgba(249,87,56,0.06)]"}`}
                        onClick={() => setImportType(type as ImportType)}
                        whileTap={{ scale: 0.92 }}
                      >
                        <Icon className={`w-[clamp(18px,1.6vw,24px)] h-[clamp(18px,1.6vw,24px)] transition-opacity duration-200 ${importType === type ? "opacity-100" : "opacity-40"}`} />
                        {importType === type && (
                          <motion.div
                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-[#f95738]"
                            layoutId="import-tab-indicator"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Content area */}
                <div className="flex-1 min-h-0 relative flex flex-col" style={{ marginTop: "clamp(16px, 4%, 32px)" }}>
                  <AnimatePresence mode="wait">
                    {importType === "file" ? (
                      <motion.div
                        key="file"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full flex-1 min-h-0 flex flex-col text-[#f95738]"
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="audio/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFileSelect(e.target.files)}
                        />
                        {uploadedFiles.length === 0 ? (
                          <div className="flex-1 flex flex-col min-h-0">
                            <motion.div
                              className={`${savedAnalyses.length > 0 ? "h-[45%]" : "flex-1"} flex flex-col items-center justify-center cursor-pointer relative shrink-0 dropzone-border group`}
                              onClick={() => fileInputRef.current?.click()}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            >
                              <motion.div
                                initial={{ y: 0 }}
                                animate={{ y: [-2, 2, -2] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                              >
                                <UploadIcon className="w-[clamp(24px,2.5vw,36px)] h-[clamp(24px,2.5vw,36px)] mb-4 group-hover:scale-110 transition-transform duration-300" />
                              </motion.div>
                              <p className="text-[clamp(13px,1.1vw,16px)] font-medium tracking-tight">Drag and drop files here</p>
                              <p className="text-[clamp(11px,0.9vw,13px)] mt-1.5 opacity-50">or click to browse</p>
                            </motion.div>

                            {savedAnalyses.length > 0 && (
                              <div className="flex-1 min-h-0 flex flex-col mt-5">
                                <div className="flex items-center gap-2 mb-3 shrink-0">
                                  <Clock className="w-3.5 h-3.5 opacity-50" />
                                  <span className="text-xs font-semibold opacity-50 tracking-wide uppercase" style={{ fontSize: 10 }}>Previous Analyses</span>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                                  {savedAnalyses.map((a, idx) => (
                                    <motion.button
                                      key={a.analysis_id}
                                      onClick={() => handleViewSavedAnalysis(a.analysis_id)}
                                      className="w-full text-left bg-[rgba(249,87,56,0.05)] border border-[rgba(249,87,56,0.12)] rounded-2xl flex items-center gap-3 hover:bg-[rgba(249,87,56,0.12)] hover:border-[rgba(249,87,56,0.25)] transition-all duration-200 cursor-pointer group"
                                      style={{ padding: "12px 18px" }}
                                      initial={{ opacity: 0, x: -8 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: idx * 0.05 }}
                                      whileHover={{ x: 3 }}
                                    >
                                      <div className="w-7 h-7 rounded-lg bg-[rgba(249,87,56,0.1)] flex items-center justify-center shrink-0 group-hover:bg-[rgba(249,87,56,0.18)] transition-colors">
                                        <Music className="w-3.5 h-3.5 text-[#f95738]/60" />
                                      </div>
                                      <span className="font-medium truncate text-sm flex-1">{a.title}</span>
                                      {a.created_at && (
                                        <span className="text-[9px] opacity-35 shrink-0 font-medium">
                                          {new Date(a.created_at).toLocaleDateString()}
                                        </span>
                                      )}
                                    </motion.button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-2">
                            <AnimatePresence>
                              {uploadedFiles.map((file, idx) => (
                                <motion.div
                                  key={`${file.name}-${idx}`}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="relative bg-[rgba(249,87,56,0.08)] border border-[rgba(249,87,56,0.2)] rounded-full flex items-center w-full shrink-0"
                                  style={{ padding: "13px 64px 13px 24px" }}
                                >
                                  <span className="text-[#f95738] font-medium truncate text-sm">{file.name}</span>
                                  <button
                                    onClick={() => handleRemoveFile(idx)}
                                    className="absolute right-[clamp(6px,0.8vw,10px)] text-[#f95738] hover:text-[#d84b31] transition-colors flex items-center justify-center w-[clamp(28px,2.8vw,36px)] h-[clamp(28px,2.8vw,36px)] rounded-full"
                                  >
                                    <X className="size-4" />
                                  </button>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                              className="flex items-center justify-center gap-2 opacity-40 hover:opacity-70 transition-opacity text-sm py-2 cursor-pointer shrink-0"
                            >
                              <UploadIcon className="w-4 h-4" />
                              add more files
                            </button>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key={importType}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full flex-1 min-h-0 flex flex-col"
                      >
                        <form onSubmit={handleAddSong} className="w-full">
                          <div className="relative flex items-center group">
                            <div className="absolute left-4 pointer-events-none text-[#f95738]/40">
                              {importType === "spotify" ? (
                                <SpotifyIcon className="w-4 h-4" />
                              ) : (
                                <YouTubeIcon className="w-4.5 h-3.5" />
                              )}
                            </div>
                            <input
                              type="text"
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              placeholder={
                                importType === "spotify"
                                  ? "Paste Spotify track or playlist link..."
                                  : "Paste YouTube video URL..."
                              }
                              className="w-full bg-[rgba(249,87,56,0.04)] border border-[rgba(249,87,56,0.5)] focus:border-[#f95738] focus:bg-[rgba(249,87,56,0.06)] rounded-full text-[#f95738] placeholder-[rgba(249,87,56,0.5)] outline-none text-sm transition-all duration-200"
                              style={{ padding: "13px 64px 13px 40px" }}
                            />
                            <motion.button
                              type="submit"
                              className="absolute right-[clamp(6px,0.8vw,10px)] bg-[#f95738] text-white w-[clamp(28px,2.8vw,36px)] h-[clamp(28px,2.8vw,36px)] rounded-full hover:bg-[#d84b31] transition-all duration-200 flex items-center justify-center hover:shadow-[0_2px_8px_rgba(249,87,56,0.3)]"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Send className="size-3.5 text-white -translate-x-px translate-y-px" />
                            </motion.button>
                          </div>
                        </form>

                        <div className="flex-1 overflow-y-auto w-full custom-scrollbar flex flex-col items-center" style={{ marginTop: 12 }}>
                          <div className="w-full h-full pb-4">
                            <AnimatePresence>
                              {songs.length === 0 ? (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="h-full flex flex-col items-center justify-center text-[#f95738]"
                                >
                                  <div className="w-12 h-12 rounded-2xl bg-[rgba(249,87,56,0.08)] flex items-center justify-center mb-3">
                                    {importType === "spotify" ? (
                                      <SpotifyIcon className="w-5 h-5 opacity-50" />
                                    ) : (
                                      <YouTubeIcon className="w-6 h-4.5 opacity-50" />
                                    )}
                                  </div>
                                  <p className="text-[clamp(13px,1.1vw,16px)] font-medium tracking-tight">No songs added yet</p>
                                  <p className="text-[clamp(11px,0.9vw,13px)] mt-1.5 text-center max-w-xs opacity-40">
                                    {importType === "spotify" && "Paste Spotify links above to get started"}
                                    {importType === "youtube" && "Paste YouTube links above to get started"}
                                  </p>
                                </motion.div>
                              ) : (
                                <div className="flex flex-col gap-2.5">
                                  {songs.map((song, idx) => (
                                    <motion.div
                                      key={`${song}-${idx}`}
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      className="relative bg-[rgba(249,87,56,0.06)] border border-[rgba(249,87,56,0.15)] rounded-2xl flex items-center group w-full hover:bg-[rgba(249,87,56,0.1)] hover:border-[rgba(249,87,56,0.25)] transition-all duration-200"
                                      style={{ padding: "12px 56px 12px 20px" }}
                                    >
                                      <span className="text-[#f95738] font-medium truncate text-sm">
                                        {song}
                                      </span>
                                      <button
                                        onClick={() => handleRemoveSong(idx)}
                                        className="absolute right-2 text-[#f95738]/50 hover:text-[#d84b31] hover:bg-[rgba(249,87,56,0.1)] transition-all duration-200 flex items-center justify-center w-8 h-8 rounded-xl"
                                      >
                                        <X className="size-3.5" />
                                      </button>
                                    </motion.div>
                                  ))}
                                </div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Bottom: count left + analyze pill right */}
                <div className="flex justify-between items-center shrink-0" style={{ marginTop: "clamp(12px, 3%, 24px)" }}>
                  <span className="text-[#f95738]/70 font-medium text-[clamp(11px,1vw,14px)] tracking-[-0.3px]">
                    {importType === "file"
                      ? `${uploadedFiles.length} ${uploadedFiles.length === 1 ? "file" : "files"} added`
                      : `${songs.length} ${songs.length === 1 ? "song" : "songs"} added`}
                  </span>
                  <motion.button
                    onClick={handleAnalyze}
                    disabled={!canAnalyze}
                    className={`text-[#f95738] font-semibold text-[clamp(13px,1.1vw,16px)] tracking-[-0.5px] rounded-full transition-all duration-200 ${canAnalyze ? "bg-[rgba(249,87,56,0.35)] hover:bg-[rgba(249,87,56,0.5)] cursor-pointer hover:shadow-[0_4px_16px_rgba(249,87,56,0.2)]" : "bg-[rgba(249,87,56,0.12)] opacity-35 cursor-not-allowed"}`}
                    style={{ padding: "clamp(8px, 1vh, 12px) clamp(20px, 2.5vw, 36px)" }}
                    whileHover={canAnalyze ? { scale: 1.03 } : {}}
                    whileTap={canAnalyze ? { scale: 0.97 } : {}}
                  >
                    analyze
                  </motion.button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(249,87,56,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(249,87,56,0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(249,87,56,0.5);
        }
      `}</style>
    </div>
  );
}
