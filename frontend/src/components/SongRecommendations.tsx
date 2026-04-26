"use client";

import { RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
}

function sourceLabel(source: string): string {
  if (source === "collaborative") return "similar listeners";
  return "brain match";
}

function sourceColor(source: string): string {
  if (source === "collaborative") return "rgba(238,150,75,0.5)";
  return "rgba(249,87,56,0.5)";
}

export default function SongRecommendations({
  className = "",
  recommendations,
  loading = false,
  onSongClick,
  onRefresh,
}: SongRecommendationsProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#0d3b66]/35 text-[9px] tracking-[0.12em] uppercase font-semibold">
          listen next
        </p>
        {onRefresh && (
          <motion.button
            onClick={onRefresh}
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

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
        {loading && recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-5 h-5 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#0d3b66]/25 text-[10px]">Finding similar vibes...</p>
          </div>
        ) : recommendations.length === 0 ? (
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
          <AnimatePresence initial={false}>
            {recommendations.map((song, i) => (
              <motion.div
                key={song.song_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onSongClick?.(song)}
                className="song-card-hover flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(13,59,102,0.04)] cursor-pointer group border border-transparent hover:border-[rgba(13,59,102,0.06)]"
              >
                {/* Album art placeholder */}
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[rgba(249,87,56,0.08)] to-[rgba(238,150,75,0.12)] flex items-center justify-center shrink-0 group-hover:from-[rgba(249,87,56,0.15)] group-hover:to-[rgba(238,150,75,0.2)] transition-all duration-200">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#f95738]/50 group-hover:text-[#f95738]/70 transition-colors">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[#0d3b66] text-[11px] font-medium truncate leading-tight group-hover:text-[#0d3b66] transition-colors">
                    {song.title}
                  </p>
                  <p className="text-[#0d3b66]/40 text-[10px] truncate leading-tight mt-0.5">
                    {song.artist}
                  </p>
                </div>

                <span
                  className="text-[8px] uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-full font-medium transition-all duration-200 group-hover:opacity-100 opacity-60"
                  style={{
                    color: sourceColor(song.source),
                    backgroundColor: `${sourceColor(song.source)}15`,
                  }}
                >
                  {sourceLabel(song.source)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
