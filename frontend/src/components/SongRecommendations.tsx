"use client";

import { RefreshCw, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useRef } from "react";

export interface RecommendedSong {
  song_id: string;
  title: string;
  artist: string;
  similarity_score: number;
  source: "brain_similarity" | "collaborative" | string;
}

interface SongRecommendationsProps {
  className?: string;
  recommendations: RecommendedSong[];
  loading?: boolean;
  onSongClick?: (song: RecommendedSong) => void;
  onRefresh?: () => void;
  onRequestCollaborative?: () => void;
}

function sourceLabel(source: string): string {
  if (source === "collaborative") return "listeners like you";
  return "brain match";
}

function sourceColor(source: string): { text: string; bg: string } {
  if (source === "collaborative") return { text: "rgba(238,150,75,0.7)", bg: "rgba(238,150,75,0.1)" };
  return { text: "rgba(249,87,56,0.6)", bg: "rgba(249,87,56,0.08)" };
}

export default function SongRecommendations({
  className = "",
  recommendations,
  loading = false,
  onSongClick,
  onRefresh,
  onRequestCollaborative,
}: SongRecommendationsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const clickCountRef = useRef(0);

  // Derive safe index without calling setState in render/effect
  const safeIndex = recommendations.length > 0 && currentIndex >= recommendations.length ? 0 : currentIndex;

  const currentSong = recommendations[safeIndex] ?? null;

  const handleClick = useCallback(() => {
    if (!currentSong) return;

    onSongClick?.(currentSong);
    clickCountRef.current += 1;

    // Every ~3 clicks, request collaborative recommendations
    if (clickCountRef.current % 3 === 0 && onRequestCollaborative) {
      onRequestCollaborative();
    }

    // Advance to next song or refresh if at the end
    if (safeIndex < recommendations.length - 1) {
      setCurrentIndex(safeIndex + 1);
    } else {
      setCurrentIndex(0);
      onRefresh?.();
    }
  }, [currentSong, safeIndex, recommendations.length, onSongClick, onRefresh, onRequestCollaborative]);

  const handleSkip = useCallback(() => {
    clickCountRef.current += 1;

    if (clickCountRef.current % 3 === 0 && onRequestCollaborative) {
      onRequestCollaborative();
    }

    if (safeIndex < recommendations.length - 1) {
      setCurrentIndex(safeIndex + 1);
    } else {
      setCurrentIndex(0);
      onRefresh?.();
    }
  }, [safeIndex, recommendations.length, onRefresh, onRequestCollaborative]);

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#0d3b66]/35 text-[9px] tracking-[0.12em] uppercase font-semibold">
          listen next
        </p>
        {onRefresh && (
          <motion.button
            onClick={() => { onRefresh(); setCurrentIndex(0); }}
            disabled={loading}
            className="text-[#0d3b66]/25 hover:text-[#f95738]/70 transition-colors disabled:opacity-30 p-1 rounded-lg hover:bg-[rgba(249,87,56,0.06)]"
            title="Refresh recommendations"
            whileHover={{ rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </motion.button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {loading && !currentSong ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-5 h-5 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#0d3b66]/25 text-[10px]">Finding similar vibes...</p>
          </div>
        ) : !currentSong ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-10 h-10 rounded-xl bg-[rgba(13,59,102,0.04)] flex items-center justify-center mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#0d3b66]/20">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <p className="text-[#0d3b66]/25 text-[10px] text-center">
              No recommendations yet
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSong.song_id}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {/* Source badge */}
              {currentSong.source === "collaborative" && (
                <motion.div
                  className="flex items-center gap-1.5 mb-2 px-1"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Users className="w-2.5 h-2.5 text-[#ee964b]/60" />
                  <span className="text-[8px] uppercase tracking-wider text-[#ee964b]/60 font-semibold">
                    listeners like you
                  </span>
                </motion.div>
              )}

              {/* Song card */}
              <motion.div
                onClick={handleClick}
                className="song-card-hover flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[rgba(13,59,102,0.02)] hover:bg-[rgba(13,59,102,0.06)] cursor-pointer group border border-[rgba(13,59,102,0.06)] hover:border-[rgba(13,59,102,0.12)] transition-all duration-200"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* Album art placeholder */}
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[rgba(249,87,56,0.08)] to-[rgba(238,150,75,0.12)] flex items-center justify-center shrink-0 group-hover:from-[rgba(249,87,56,0.15)] group-hover:to-[rgba(238,150,75,0.2)] transition-all duration-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#f95738]/50 group-hover:text-[#f95738]/70 transition-colors">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[#0d3b66] text-[12px] font-medium truncate leading-tight group-hover:text-[#0d3b66] transition-colors">
                    {currentSong.title}
                  </p>
                  <p className="text-[#0d3b66]/40 text-[10px] truncate leading-tight mt-0.5">
                    {currentSong.artist}
                  </p>
                </div>

                <span
                  className="text-[8px] uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-full font-medium"
                  style={{
                    color: sourceColor(currentSong.source).text,
                    backgroundColor: sourceColor(currentSong.source).bg,
                  }}
                >
                  {sourceLabel(currentSong.source)}
                </span>
              </motion.div>

              {/* Skip button */}
              <div className="flex justify-center mt-2.5">
                <motion.button
                  onClick={handleSkip}
                  className="text-[#0d3b66]/20 hover:text-[#0d3b66]/40 text-[9px] tracking-wide transition-colors"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  skip →
                </motion.button>
              </div>

              {/* Progress indicator */}
              {recommendations.length > 1 && (
                <div className="flex items-center justify-center gap-1 mt-2">
                  <span className="text-[#0d3b66]/15 text-[8px] tabular-nums">
                    {safeIndex + 1} / {recommendations.length}
                  </span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
