"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ImportOverlayProps {
  onConfirm: () => void;
  onClose: () => void;
}

export default function ImportOverlay({ onConfirm, onClose }: ImportOverlayProps) {
  const [activeTab, setActiveTab] = useState<"file" | "spotify" | "youtube">("file");
  const [fileName, setFileName] = useState("");
  const [link, setLink] = useState("");
  const [isExiting, setIsExiting] = useState(false);

  const handleConfirm = () => {
    setIsExiting(true);
    setTimeout(() => {
      onConfirm();
    }, 400);
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(255, 253, 245, 0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isExiting ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <motion.div
          layoutId="import-container"
          className="glass-strong rounded-3xl pointer-events-auto overflow-hidden"
          style={{
            boxShadow: "0 24px 80px rgba(13, 59, 102, 0.12), 0 8px 32px rgba(0,0,0,0.06)",
            width: "min(480px, 90vw)",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <AnimatePresence mode="wait">
            {!isExiting && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                className="p-8"
              >
                <h2 className="font-display text-navy text-2xl font-bold tracking-tight mb-1">
                  Import Music
                </h2>
                <p className="font-body text-navy/50 text-sm mb-6">
                  Upload a file or paste a link to analyze.
                </p>

                <div className="flex gap-1 mb-6 p-1 rounded-xl bg-navy/[0.04]">
                  {(["file", "spotify", "youtube"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-body font-semibold tracking-wide capitalize transition-all duration-200 cursor-pointer ${
                        activeTab === tab
                          ? "bg-white text-navy shadow-sm"
                          : "text-navy/40 hover:text-navy/60"
                      }`}
                    >
                      {tab === "file" ? "File" : tab === "spotify" ? "Spotify" : "YouTube"}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === "file" && (
                    <motion.div
                      key="file"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <label
                        className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-navy/10 rounded-2xl cursor-pointer hover:border-heatmap-hot/30 hover:bg-heatmap-hot/[0.02] transition-all duration-300"
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
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#0d3b66"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mb-2 opacity-30"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        {fileName ? (
                          <span className="text-sm font-body text-navy font-medium">
                            {fileName}
                          </span>
                        ) : (
                          <span className="text-sm font-body text-navy/30">
                            Drop audio file or click to browse
                          </span>
                        )}
                      </label>
                    </motion.div>
                  )}

                  {activeTab === "spotify" && (
                    <motion.div
                      key="spotify"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" className="text-[#1DB954] flex-shrink-0">
                          <path
                            fill="currentColor"
                            d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
                          />
                        </svg>
                        <span className="font-body text-sm text-navy/60">Paste a Spotify track or playlist URL</span>
                      </div>
                      <input
                        type="url"
                        placeholder="https://open.spotify.com/track/..."
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-navy/[0.03] border border-navy/[0.08] text-navy font-body text-sm placeholder:text-navy/25 transition-all duration-200 focus:border-[#1DB954]/40 focus:bg-white"
                      />
                    </motion.div>
                  )}

                  {activeTab === "youtube" && (
                    <motion.div
                      key="youtube"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" className="text-[#FF0000] flex-shrink-0">
                          <path
                            fill="currentColor"
                            d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
                          />
                        </svg>
                        <span className="font-body text-sm text-navy/60">Paste a YouTube video URL</span>
                      </div>
                      <input
                        type="url"
                        placeholder="https://youtube.com/watch?v=..."
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-navy/[0.03] border border-navy/[0.08] text-navy font-body text-sm placeholder:text-navy/25 transition-all duration-200 focus:border-[#FF0000]/30 focus:bg-white"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.button
                  onClick={handleConfirm}
                  className="w-full mt-6 py-3.5 rounded-2xl bg-navy text-bg font-body font-semibold text-sm tracking-wide cursor-pointer hover:bg-navy/90 active:scale-[0.98] transition-all duration-200"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Analyze
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
