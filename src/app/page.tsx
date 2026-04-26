"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { X, Send } from "lucide-react";
import {
  SeratuneLogo,
  SpiderChartSvg,
  SoundBarsIcon,
  FileIcon,
  SpotifyIcon,
  YouTubeIcon,
  UploadIcon,
} from "@/components/Icons";
import ColorBends, { type ColorBendsHandle } from "@/components/ColorBends";

const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
});

type ViewState = "intro" | "importing" | "analysis";
type ImportType = "file" | "spotify" | "youtube";

const panelEase = [0.16, 1, 0.3, 1] as const;
const TOPBAR_H = 93;

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("intro");
  const [importType, setImportType] = useState<ImportType>("file");
  const [songs, setSongs] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [brainFlashing, setBrainFlashing] = useState(false);
  const colorBendsRef = useRef<ColorBendsHandle>(null);
  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [vw, setVw] = useState(1280);
  const [vh, setVh] = useState(832);

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
    const brainSize = Math.min(contentH * 0.95, vw * 0.55);
    return {
      brainW: brainSize,
      brainH: brainSize,
      brainIntroX: vw * 0.5 - brainSize * 0.5,
      brainAnalysisX: 0,
      brainTop: TOPBAR_H + (contentH - brainSize) / 2,
      pillW: 140,
      pillH: 50,
      pillX: vw * 0.7,
      pillY: TOPBAR_H / 2 - 25,
      panelW: Math.min(vw * 0.72, 920),
      panelH: Math.min(contentH * 0.88, 650),
      panelX: (vw - Math.min(vw * 0.72, 920)) / 2,
      panelY: TOPBAR_H + (contentH - Math.min(contentH * 0.88, 650)) / 2,
      rightPanelW: vw * 0.5,
      logoLeft: vw * 0.14,
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

  const cancelAnalyzeTimeout = () => {
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
      analyzeTimeoutRef.current = null;
    }
  };

  const handleAnalyze = () => {
    cancelAnalyzeTimeout();
    setBrainFlashing(true);
    analyzeTimeoutRef.current = setTimeout(() => {
      analyzeTimeoutRef.current = null;
      setBrainFlashing(false);
      setViewState("analysis");
    }, 800);
  };

  useEffect(() => () => cancelAnalyzeTimeout(), []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#fffdf5] font-sans selection:bg-[#f95738] selection:text-white">
      {/* Color Bends Background */}
      <div className="absolute inset-0 pointer-events-none" style={{ top: TOPBAR_H }}>
        <div className="absolute inset-0 opacity-75">
          <ColorBends
            ref={colorBendsRef}
            colors={["#0d3b66", "#1a5a96", "#2470b8", "#4a88cc", "#8ab8e0", "#c4dcf4"]}
            speed={0.025}
            frequency={0.2}
            warpStrength={0.16}
            scale={2.2}
            intensity={0.82}
            noise={0.025}
            iterations={2}
            bandWidth={7}
            transparent={false}
            mouseInfluence={0.015}
            parallax={0.04}
          />
        </div>
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
        initial={false}
        animate={{
          x: viewState === "analysis" ? layout.brainAnalysisX : layout.brainIntroX,
        }}
        transition={{ duration: 0.8, ease: panelEase }}
      >
        <BrainScene
          className="w-full h-full"
          flashing={brainFlashing}
          interactive={viewState === "analysis"}
          timePosition={0}
        />
      </motion.div>

      {/* Logo Group — clickable, returns to intro */}
      <div
        className="absolute top-0 z-20 flex items-center gap-4 cursor-pointer transition-opacity hover:opacity-80"
        style={{ left: layout.logoLeft, height: TOPBAR_H }}
        onClick={() => { cancelAnalyzeTimeout(); setBrainFlashing(false); setViewState("intro"); }}
      >
        <div className="flex">
          <div className="bg-[#f4d35e] h-6 w-[3px]" />
          <div className="bg-[#ee964b] h-6 w-[3px]" />
          <div className="bg-[#f95738] h-6 w-[3px]" />
        </div>
        <SeratuneLogo className="h-[40px] w-auto" />
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
              className="absolute inset-0 p-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="relative w-full max-w-[408px] mx-auto" style={{ aspectRatio: "1/1" }}>
                <SpiderChartSvg className="absolute block inset-0 size-full" />
                <p className="absolute -left-[50px] top-[35%] text-[#0d3b66] text-sm">danceability</p>
                <p className="absolute left-[25%] bottom-[-20px] text-[#0d3b66] text-sm">energy</p>
                <p className="absolute right-[25%] bottom-[-20px] text-[#0d3b66] text-sm">valence</p>
                <p className="absolute -right-[20px] top-[35%] text-[#0d3b66] text-sm">tempo</p>
              </div>
              <p className="mt-12 text-[#0d3b66] text-sm tracking-[-0.56px] max-w-sm whitespace-pre-wrap">
                overview:
                {"\n\n"}
                This music fits a limbic-dominant profile with strong auditory cortex engagement. High introspective alignment suggests deep default-mode network resonance characteristic of emotional processing music.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Click Outside Overlay — dismiss importing */}
      {viewState === "importing" && (
        <div
          className="absolute inset-0 z-[15]"
          onClick={() => { cancelAnalyzeTimeout(); setBrainFlashing(false); setViewState("intro"); }}
        />
      )}

      {/* Import Button / Panel — spring expansion */}
      <AnimatePresence>
        {viewState !== "analysis" && (
          <motion.div
            className="absolute bg-[rgba(249,87,56,0.2)] overflow-hidden z-20 shadow-sm backdrop-blur-[24px]"
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

                {/* Content area — large gap below header matching figma */}
                <div className="flex-1 min-h-0 relative flex flex-col" style={{ marginTop: "clamp(16px, 4%, 32px)" }}>
                  <AnimatePresence mode="wait">
                    {importType === "file" ? (
                      <motion.div
                        key="file"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full flex-1 flex flex-col items-center justify-center text-[#f95738]"
                      >
                        <div className="absolute inset-0 rounded-[30px] border-[3px] border-[#f95738] border-dashed pointer-events-none opacity-40" />
                        <UploadIcon className="w-[clamp(24px,2.5vw,36px)] h-[clamp(24px,2.5vw,36px)] mb-4" />
                        <p className="text-[clamp(13px,1.1vw,16px)] font-medium tracking-tight">Drag and drop files here</p>
                        <p className="text-[clamp(11px,0.9vw,13px)] mt-1.5 opacity-60">or click to browse</p>
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
                              className="w-full bg-[rgba(249,87,56,0.06)] border border-[rgba(249,87,56,0.2)] focus:border-[#f95738] rounded-full text-[#f95738] placeholder-[rgba(249,87,56,0.35)] outline-none text-sm transition-colors"
                              style={{ padding: "13px 64px 13px 24px" }}
                            />
                            <button
                              type="submit"
                              className="absolute right-[clamp(6px,0.8vw,10px)] bg-[#f95738] text-white w-[clamp(28px,2.8vw,36px)] h-[clamp(28px,2.8vw,36px)] rounded-full hover:bg-[#d84b31] transition-colors flex items-center justify-center"
                            >
                              <Send className="size-3.5 text-white" />
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
                                  <p className="text-[clamp(13px,1.1vw,16px)] font-medium tracking-tight opacity-60">List is empty</p>
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

                {/* Bottom: song count left + analyze pill right */}
                <div className="flex justify-between items-center shrink-0" style={{ marginTop: "clamp(12px, 3%, 24px)" }}>
                  <span className="text-[#f95738] font-medium text-[clamp(12px,1.1vw,16px)] tracking-[-0.5px] opacity-60">
                    {songs.length} {songs.length === 1 ? "song" : "songs"} added
                  </span>
                  <button
                    onClick={handleAnalyze}
                    className="bg-[rgba(249,87,56,0.35)] hover:bg-[rgba(249,87,56,0.5)] transition-colors text-[#f95738] font-medium text-[clamp(14px,1.2vw,18px)] tracking-[-0.72px] rounded-full cursor-pointer"
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
