"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ImportOverlayProps {
  onConfirm: () => void;
  onClose: () => void;
}

const FileIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const SpotifyIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke={active ? "none" : "currentColor"} strokeWidth="1.5">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

const YouTubeIcon = ({ active }: { active: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke={active ? "none" : "currentColor"} strokeWidth="1.5" strokeLinecap="round">
    {active ? (
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    ) : (
      <>
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <path d="M10 9.5l6 3-6 3V9.5z" />
      </>
    )}
  </svg>
);

export default function ImportOverlay({ onConfirm, onClose }: ImportOverlayProps) {
  const [activeTab, setActiveTab] = useState<"file" | "spotify" | "youtube">("file");
  const [fileName, setFileName] = useState("");
  const [link, setLink] = useState("");
  const [isExiting, setIsExiting] = useState(false);

  const handleConfirm = () => {
    setIsExiting(true);
    setTimeout(onConfirm, 400);
  };

  const cardStyle = {
    background: "rgba(249, 87, 56, 0.18)",
    backdropFilter: "blur(48px)",
    WebkitBackdropFilter: "blur(48px)",
    borderRadius: 100,
    border: "1px solid rgba(249, 87, 56, 0.15)",
    boxShadow: "0 32px 80px rgba(249, 87, 56, 0.08), 0 8px 32px rgba(0,0,0,0.06)",
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Click-away */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Card */}
      <motion.div
        layoutId="import-container"
        className="relative flex flex-col pointer-events-auto"
        style={{
          ...cardStyle,
          width: "min(918px, 90vw)",
          height: "min(650px, 80vh)",
        }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        <AnimatePresence mode="wait">
          {!isExiting && (
            <motion.div
              className="flex flex-col h-full"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
            >
              {/* Header: "import:" left, icon tabs right */}
              <div className="pt-12 px-14 pb-8 flex items-center justify-between">
                <h2
                  className="font-display text-heatmap-hot"
                  style={{ fontSize: 36, letterSpacing: "-0.04em", lineHeight: 1 }}
                >
                  import:
                </h2>

                {/* Icon-based source tabs */}
                <div className="flex gap-2">
                  {(["file", "spotify", "youtube"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="cursor-pointer flex items-center justify-center rounded-full transition-all duration-200"
                      style={{
                        width: 42,
                        height: 42,
                        background: activeTab === tab
                          ? "rgba(249, 87, 56, 0.22)"
                          : "rgba(255,255,255,0.15)",
                        color: activeTab === tab
                          ? "rgba(249,87,56,1)"
                          : "rgba(13,59,102,0.4)",
                        border: activeTab === tab
                          ? "1px solid rgba(249, 87, 56, 0.3)"
                          : "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      {tab === "file" && <FileIcon active={activeTab === "file"} />}
                      {tab === "spotify" && <SpotifyIcon active={activeTab === "spotify"} />}
                      {tab === "youtube" && <YouTubeIcon active={activeTab === "youtube"} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content area */}
              <div className="flex-1 px-14 overflow-hidden">
                <AnimatePresence mode="wait">
                  {activeTab === "file" && (
                    <motion.div
                      key="file"
                      className="h-full"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.2 }}
                    >
                      <label
                        className="flex flex-col items-center justify-center w-full h-full border-2 border-dashed cursor-pointer transition-all duration-300"
                        style={{
                          borderRadius: 50,
                          borderColor: "rgba(249, 87, 56, 0.35)",
                          background: "rgba(255,255,255,0.10)",
                        }}
                      >
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setFileName(file.name);
                          }}
                        />
                        <svg
                          width="40"
                          height="40"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(13,59,102,0.3)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mb-4"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        {fileName ? (
                          <span className="text-sm font-body text-navy font-medium">{fileName}</span>
                        ) : (
                          <span className="text-sm font-body text-navy/35">
                            drop audio file or click to browse
                          </span>
                        )}
                      </label>
                    </motion.div>
                  )}

                  {activeTab === "spotify" && (
                    <motion.div
                      key="spotify"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: "#1DB954", flexShrink: 0 }}>
                          <path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                        <span className="font-body text-sm text-navy/60">paste a Spotify track or playlist URL</span>
                      </div>
                      <input
                        type="url"
                        placeholder="https://open.spotify.com/track/..."
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        className="w-full px-5 py-3.5 rounded-2xl font-body text-sm text-navy placeholder:text-navy/25 transition-all duration-200"
                        style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", outline: "none" }}
                      />
                    </motion.div>
                  )}

                  {activeTab === "youtube" && (
                    <motion.div
                      key="youtube"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: "#FF0000", flexShrink: 0 }}>
                          <path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                        <span className="font-body text-sm text-navy/60">paste a YouTube video URL</span>
                      </div>
                      <input
                        type="url"
                        placeholder="https://youtube.com/watch?v=..."
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        className="w-full px-5 py-3.5 rounded-2xl font-body text-sm text-navy placeholder:text-navy/25 transition-all duration-200"
                        style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", outline: "none" }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom analyze pill */}
              <div className="flex justify-center py-10">
                <motion.button
                  onClick={handleConfirm}
                  className="font-body font-semibold text-heatmap-hot cursor-pointer rounded-full"
                  style={{
                    background: "rgba(249, 87, 56, 0.22)",
                    height: 51,
                    minWidth: 157,
                    paddingLeft: 32,
                    paddingRight: 32,
                    fontSize: 16,
                    letterSpacing: "-0.02em",
                  }}
                  whileHover={{ scale: 1.03, backgroundColor: "rgba(249, 87, 56, 0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                >
                  analyze
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
