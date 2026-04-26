"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
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

export default function Home() {
  const [viewState, setViewState] = useState<ViewState>("intro");
  const [importType, setImportType] = useState<ImportType>("file");
  const [songs, setSongs] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [brainFlashing, setBrainFlashing] = useState(false);
  const colorBendsRef = useRef<ColorBendsHandle>(null);

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

  const handleAnalyze = () => {
    setBrainFlashing(true);
    setTimeout(() => {
      setBrainFlashing(false);
      setViewState("analysis");
    }, 800);
  };

  return (
    <div
      className="relative w-[1280px] h-[832px] overflow-hidden bg-[#fffdf5] font-sans selection:bg-[#f95738] selection:text-white max-w-[100vw] max-h-[100vh] flex-shrink-0"
      style={{ transformOrigin: "top left" }}
    >
      {/* Color Bends Background — replaces the static figma image */}
      <div className="absolute left-[-617px] top-[-93px] w-[1920px] h-[1080px] pointer-events-none">
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
        className="absolute bg-[#fffdf5] h-[93px] left-0 top-0 w-[1280px] z-0"
        initial={false}
        animate={{ y: viewState === "analysis" ? -93 : 0 }}
        transition={{ duration: 0.8, ease: panelEase }}
      />

      {/* 3D Brain — slides left on analysis */}
      <motion.div
        className={`absolute w-[662px] h-[738px] top-[103px] pointer-events-none z-10 ${brainFlashing ? "brain-flash" : ""}`}
        initial={false}
        animate={{
          x: viewState === "analysis" ? -11 : 309,
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
        className="absolute left-[182px] top-[52px] z-20 flex items-center gap-[16px] cursor-pointer transition-opacity hover:opacity-80"
        onClick={() => setViewState("intro")}
      >
        <div className="flex">
          <div className="bg-[#f4d35e] h-[24px] w-[3px]" />
          <div className="bg-[#ee964b] h-[24px] w-[3px]" />
          <div className="bg-[#f95738] h-[24px] w-[3px]" />
        </div>
        <SeratuneLogo className="h-[40.576px] w-[242.147px]" />
      </div>

      {/* Right Section (Analysis View) — slides in from right */}
      <motion.div
        className="absolute bg-[#fffdf5] h-[832px] top-0 w-[640px] z-10"
        initial={false}
        animate={{
          x: viewState === "analysis" ? 640 : 1280,
        }}
        transition={{ duration: 0.8, ease: panelEase }}
      >
        <AnimatePresence>
          {viewState === "analysis" && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="absolute left-[132px] size-[408px] top-[53px]">
                <SpiderChartSvg className="absolute block inset-0 size-full" />
                <p className="absolute -left-[50px] top-[140px] text-[#0d3b66] text-[14px]">danceability</p>
                <p className="absolute left-[100px] bottom-[-20px] text-[#0d3b66] text-[14px]">energy</p>
                <p className="absolute right-[100px] bottom-[-20px] text-[#0d3b66] text-[14px]">valence</p>
                <p className="absolute -right-[20px] top-[140px] text-[#0d3b66] text-[14px]">tempo</p>
              </div>
              <p className="absolute font-normal h-[252px] leading-[normal] left-[59px] text-[#0d3b66] text-[14px] top-[540px] tracking-[-0.56px] w-[336px] whitespace-pre-wrap">
                overview:
                <br />
                <br />
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
          onClick={() => setViewState("intro")}
        />
      )}

      {/* Import Button / Panel — spring expansion */}
      <AnimatePresence>
        {viewState !== "analysis" && (
          <motion.div
            className="absolute bg-[rgba(249,87,56,0.15)] overflow-hidden z-20 shadow-sm backdrop-blur-[24px]"
            initial={false}
            animate={{
              width: viewState === "intro" ? 140 : 918,
              height: viewState === "intro" ? 50 : 650,
              x: viewState === "intro" ? 901 : 181,
              y: viewState === "intro" ? 75 : 137,
              borderRadius: 100,
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
                <span className="font-medium text-[20px] tracking-[-0.8px]">import</span>
                <SoundBarsIcon className="size-[24px]" />
              </motion.button>
            ) : (
              <motion.div
                className="relative w-full h-full p-12 flex flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {/* Header: "import:" left, icon tabs right */}
                <div className="flex justify-between items-start mb-6">
                  <h2 className="font-medium text-[#f95738] text-[24px] tracking-[-0.96px]">import:</h2>
                  <div className="flex gap-6 mr-6 mt-1 text-[#f95738] items-center">
                    <button
                      className={`transition-all duration-200 cursor-pointer ${importType === "file" ? "opacity-100 scale-110" : "opacity-50 hover:opacity-80"}`}
                      onClick={() => setImportType("file")}
                    >
                      <FileIcon className="w-[26px] h-[30px]" />
                    </button>
                    <button
                      className={`transition-all duration-200 cursor-pointer ${importType === "spotify" ? "opacity-100 scale-110" : "opacity-50 hover:opacity-80"}`}
                      onClick={() => setImportType("spotify")}
                    >
                      <SpotifyIcon className="w-[30px] h-[30px]" />
                    </button>
                    <button
                      className={`transition-all duration-200 cursor-pointer ${importType === "youtube" ? "opacity-100 scale-110" : "opacity-50 hover:opacity-80"}`}
                      onClick={() => setImportType("youtube")}
                    >
                      <YouTubeIcon className="w-[34px] h-[24px]" />
                    </button>
                  </div>
                </div>

                {/* Content area */}
                <div className="flex-1 relative flex flex-col">
                  <AnimatePresence mode="wait">
                    {importType === "file" ? (
                      <motion.div
                        key="file"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full h-full p-8 flex flex-col items-center justify-center text-[#f95738]"
                      >
                        <div className="absolute inset-0 rounded-[30px] border-4 border-[#f95738] border-dashed pointer-events-none opacity-50" />
                        <UploadIcon className="size-[40px] mb-3" />
                        <p className="text-base font-medium tracking-tight">Drag and drop files here</p>
                        <p className="text-sm mt-1">or click to browse</p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={importType}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full h-full flex flex-col"
                      >
                        <form onSubmit={handleAddSong} className="w-full max-w-xl mx-auto mt-2">
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
                              className="w-full bg-[rgba(249,87,56,0.1)] border-2 border-[rgba(249,87,56,0.3)] focus:border-[#f95738] rounded-full py-2.5 px-5 text-[#f95738] placeholder-[#f95738] outline-none text-base transition-colors"
                            />
                            <button
                              type="submit"
                              className="absolute right-2 bg-[#f95738] text-white w-8 h-8 rounded-full hover:bg-[#d84b31] transition-colors flex items-center justify-center"
                            >
                              <Send className="size-[16px] text-white relative right-[1px] top-[1px]" />
                            </button>
                          </div>
                        </form>

                        <div className="flex-1 overflow-y-auto mt-6 w-full custom-scrollbar flex flex-col items-center">
                          <div className="w-full max-w-xl h-full pb-6">
                            <AnimatePresence>
                              {songs.length === 0 ? (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="h-full flex flex-col items-center justify-center text-[#f95738]"
                                >
                                  <p className="text-base font-medium tracking-tight">List is empty</p>
                                  <p className="text-sm mt-1 text-center max-w-xs">
                                    {importType === "spotify" && "Add Spotify links to begin analysis"}
                                    {importType === "youtube" && "Add YouTube video links to begin analysis"}
                                  </p>
                                </motion.div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {songs.map((song, idx) => (
                                    <motion.div
                                      key={`${song}-${idx}`}
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      className="bg-[rgba(249,87,56,0.15)] rounded-xl py-2.5 px-5 flex items-center justify-between group w-full"
                                    >
                                      <span className="text-[#f95738] font-medium truncate pr-4 text-base">
                                        {song}
                                      </span>
                                      <button
                                        onClick={() => handleRemoveSong(idx)}
                                        className="text-[#f95738] hover:text-[#d84b31] transition-colors p-1 -mr-1"
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

                {/* Bottom: song count + analyze button */}
                <div className="mt-6 flex justify-between items-center pb-2 pl-4">
                  <div className="text-[#f95738] font-medium text-lg tracking-tight">
                    {songs.length} {songs.length === 1 ? "song" : "songs"} added
                  </div>
                  <button
                    onClick={handleAnalyze}
                    className="bg-[rgba(249,87,56,0.2)] hover:bg-[rgba(249,87,56,0.3)] transition-colors text-[#f95738] font-medium text-[20px] tracking-[-0.8px] py-[6px] px-[28px] rounded-[50px] shadow-sm backdrop-blur-[16px] cursor-pointer"
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
