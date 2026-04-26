"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { X, Send, LogOut } from "lucide-react";
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
import { apiFetch, apiUrl } from "@/lib/api";

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

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

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
    setSongs([]);
    setUploadedFiles([]);
    setInputValue("");
  };

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
        "/clusters/analyze",
        { method: "POST", body: JSON.stringify(body) },
        token,
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const { batch_id, total_songs } = await res.json();
      setProcessingTotal(total_songs);

      // Clean up previous EventSource if any
      eventSourceRef.current?.close();

      const eventSource = new EventSource(apiUrl(`/clusters/batch/${batch_id}/events`));
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("song_complete", (e) => {
        const data = JSON.parse(e.data);
        setProcessingProgress(data.index);
        setProcessingTotal(data.total);
        setProcessingStatus(
          `Analyzed ${data.index}/${data.total}: ${data.song}`,
        );
      });

      eventSource.addEventListener("song_error", (e) => {
        const data = JSON.parse(e.data);
        setProcessingStatus(`Error on ${data.song}: ${data.error}`);
      });

      eventSource.addEventListener("complete", (e) => {
        const result = JSON.parse(e.data);
        setAnalysisResult(result);
        setBrainFlashing(false);
        setViewState("analysis");
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.addEventListener("error", (e) => {
        const data = e instanceof MessageEvent ? JSON.parse(e.data) : null;
        setProcessingStatus(
          `Analysis failed: ${data?.message ?? "Unknown error"}`,
        );
        setBrainFlashing(false);
        setViewState("importing");
        eventSource.close();
        eventSourceRef.current = null;
      });

      eventSource.onerror = () => {
        setProcessingStatus("Connection lost. Please try again.");
        setBrainFlashing(false);
        setViewState("importing");
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err) {
      setProcessingStatus(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setBrainFlashing(false);
      setViewState("importing");
    }
  }, [songs, session]);

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

  // Build overview text from analysis result
  const overviewText = analysisResult
    ? (analysisResult as Record<string, unknown>).summary as string ??
      (analysisResult as Record<string, unknown>).vibe_description as string ??
      "Analysis complete — explore the brain activation patterns above."
    : "";

  // Extract region scores for radar chart
  const radarData = useMemo(() => {
    if (!analysisResult) return undefined;
    const scores =
      (analysisResult as Record<string, unknown>).combined_region_scores as Record<string, number> | undefined ??
      (analysisResult as Record<string, unknown>).region_scores as Record<string, number> | undefined;
    if (!scores) return undefined;
    return Object.entries(scores)
      .filter(([key]) => key !== "whole_cortex")
      .map(([key, value]) => ({
        attribute: key.replace(/_/g, " "),
        value: Math.round(Number(value) * 100),
      }));
  }, [analysisResult]);

  // Extract fingerprint for brain visualization
  const fingerprint = useMemo(() => {
    if (!analysisResult) return undefined;
    return (
      (analysisResult as Record<string, unknown>).combined_fingerprint_b64 as string | undefined ??
      (analysisResult as Record<string, unknown>).fingerprint as string | undefined
    );
  }, [analysisResult]);

  // Extract top matches for song recommendations
  const topMatches = useMemo(() => {
    if (!analysisResult) return undefined;
    const matches = (analysisResult as Record<string, unknown>).top_matches as Array<{
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
          activationLevel={analysisResult ? 0.8 : 0.5}
          fingerprint={fingerprint}
          timePosition={0}
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
        className="absolute top-0 right-8 z-20 flex items-center gap-4"
        style={{ height: TOPBAR_H }}
      >
        <span className="text-[#0d3b66]/50 text-sm">{displayName}</span>
        <button
          onClick={signOut}
          className="text-[#0d3b66]/30 hover:text-[#f95738] transition-colors cursor-pointer"
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
              className="absolute inset-0 px-10 pt-6 pb-8 flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {/* Header with back button */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <button
                  onClick={resetState}
                  className="text-[#0d3b66]/40 hover:text-[#f95738] text-xs font-medium tracking-tight transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  new analysis
                </button>
                <span className="text-[#0d3b66]/25 text-[9px] tracking-[0.1em] uppercase font-semibold">
                  brain response
                </span>
              </div>

              {/* Top row: Radar + Timeline side by side */}
              <div className="flex gap-6 shrink-0">
                <MusicRadarChart
                  data={radarData}
                  className="w-1/2"
                  style={{ height: "min(240px, 28vh)" }}
                />
                <div className="w-1/2 flex flex-col justify-center">
                  <AudioTimeline duration={214} className="w-full" />
                  {overviewText && (
                    <p className="text-[#0d3b66]/50 text-xs mt-4 leading-relaxed line-clamp-4">
                      {overviewText}
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom: Chat + Song Recommendations */}
              <div className="flex-1 min-h-0 flex gap-4 mt-4">
                <ChatInterface
                  overview={overviewText}
                  className="flex-1 min-w-0"
                />
                <SongRecommendations
                  songs={topMatches}
                  className="w-[40%] shrink-0"
                />
              </div>
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
            className="absolute z-30 flex flex-col items-center justify-center bg-[#fffdf5]/90 backdrop-blur-sm"
            style={{ inset: 0 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-8 h-8 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin mb-6" />
            <p className="text-[#f95738] font-medium text-lg tracking-tight mb-2">
              Analyzing...
            </p>
            {processingTotal > 0 && (
              <div className="w-64 mb-4">
                <div className="w-full h-2 rounded-full bg-[rgba(249,87,56,0.15)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-[#f95738]"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(processingProgress / processingTotal) * 100}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-[#f95738]/60 text-xs mt-2 text-center">
                  {processingProgress} / {processingTotal}
                </p>
              </div>
            )}
            <p className="text-[#f95738]/60 text-sm text-center max-w-md px-8">
              {processingStatus}
            </p>
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
              >
                <span className="font-medium text-xl tracking-[-0.8px]">import</span>
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
                  <h2 className="font-medium text-[#f95738] text-[clamp(18px,2vw,26px)] tracking-[-1px] leading-none">import:</h2>
                  <div className="flex gap-[clamp(12px,1.6vw,20px)] text-[#f95738] items-center">
                    <button
                      className={`transition-all duration-200 cursor-pointer p-1 ${importType === "file" ? "opacity-100 scale-110" : "opacity-40 hover:opacity-70"}`}
                      onClick={() => setImportType("file")}
                    >
                      <FileIcon className="w-[clamp(18px,1.6vw,24px)] h-[clamp(20px,1.8vw,28px)]" />
                    </button>
                    <button
                      className={`transition-all duration-200 cursor-pointer p-1 ${importType === "spotify" ? "opacity-100 scale-110" : "opacity-40 hover:opacity-70"}`}
                      onClick={() => setImportType("spotify")}
                    >
                      <SpotifyIcon className="w-[clamp(20px,1.8vw,26px)] h-[clamp(20px,1.8vw,26px)]" />
                    </button>
                    <button
                      className={`transition-all duration-200 cursor-pointer p-1 ${importType === "youtube" ? "opacity-100 scale-110" : "opacity-40 hover:opacity-70"}`}
                      onClick={() => setImportType("youtube")}
                    >
                      <YouTubeIcon className="w-[clamp(22px,2vw,28px)] h-[clamp(16px,1.4vw,20px)]" />
                    </button>
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
                          <div
                            className="flex-1 flex flex-col items-center justify-center cursor-pointer relative rounded-[30px]"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                          >
                            <div className="absolute inset-0 rounded-[30px] border-[3px] border-[#f95738] border-dashed pointer-events-none opacity-40" />
                            <UploadIcon className="w-[clamp(24px,2.5vw,36px)] h-[clamp(24px,2.5vw,36px)] mb-4" />
                            <p className="text-[clamp(13px,1.1vw,16px)] font-medium tracking-tight">Drag and drop files here</p>
                            <p className="text-[clamp(11px,0.9vw,13px)] mt-1.5 opacity-60">or click to browse</p>
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
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              placeholder={
                                importType === "spotify"
                                  ? "Paste Spotify track/playlist link..."
                                  : "Paste YouTube video URL..."
                              }
                              className="w-full bg-[rgba(249,87,56,0.06)] border border-[rgba(249,87,56,0.7)] focus:border-[#f95738] rounded-full text-[#f95738] placeholder-[rgba(249,87,56,0.75)] outline-none text-sm transition-colors"
                              style={{ padding: "13px 64px 13px 24px" }}
                            />
                            <button
                              type="submit"
                              className="absolute right-[clamp(6px,0.8vw,10px)] bg-[#f95738] text-white w-[clamp(28px,2.8vw,36px)] h-[clamp(28px,2.8vw,36px)] rounded-full hover:bg-[#d84b31] transition-colors flex items-center justify-center"
                            >
                              <Send className="size-3.5 text-white -translate-x-px translate-y-px" />
                            </button>
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
                                  <p className="text-[clamp(13px,1.1vw,16px)] font-medium tracking-tight">List is empty</p>
                                  <p className="text-[clamp(11px,0.9vw,13px)] mt-1.5 text-center max-w-xs opacity-40">
                                    {importType === "spotify" && "Add Spotify links to begin analysis"}
                                    {importType === "youtube" && "Add YouTube video links to begin analysis"}
                                  </p>
                                </motion.div>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  {songs.map((song, idx) => (
                                    <motion.div
                                      key={`${song}-${idx}`}
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      className="relative bg-[rgba(249,87,56,0.08)] border border-[rgba(249,87,56,0.2)] rounded-full flex items-center group w-full"
                                      style={{ padding: "13px 64px 13px 24px" }}
                                    >
                                      <span className="text-[#f95738] font-medium truncate text-sm">
                                        {song}
                                      </span>
                                      <button
                                        onClick={() => handleRemoveSong(idx)}
                                        className="absolute right-[clamp(6px,0.8vw,10px)] text-[#f95738] hover:text-[#d84b31] transition-colors flex items-center justify-center w-[clamp(28px,2.8vw,36px)] h-[clamp(28px,2.8vw,36px)] rounded-full"
                                      >
                                        <X className="size-4" />
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
                  <span className="text-[#f95738] font-medium text-[clamp(12px,1.1vw,16px)] tracking-[-0.5px]">
                    {importType === "file"
                      ? `${uploadedFiles.length} ${uploadedFiles.length === 1 ? "file" : "files"} added`
                      : `${songs.length} ${songs.length === 1 ? "song" : "songs"} added`}
                  </span>
                  <button
                    onClick={handleAnalyze}
                    disabled={!canAnalyze}
                    className={`transition-colors text-[#f95738] font-medium text-[clamp(14px,1.2vw,18px)] tracking-[-0.72px] rounded-full ${canAnalyze ? "bg-[rgba(249,87,56,0.35)] hover:bg-[rgba(249,87,56,0.5)] cursor-pointer" : "bg-[rgba(249,87,56,0.15)] opacity-40 cursor-not-allowed"}`}
                    style={{ padding: "clamp(8px, 1vh, 12px) clamp(20px, 2.5vw, 36px)" }}
                  >
                    analyze
                  </button>
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
