"use client";

import { RefreshCw } from "lucide-react";

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
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-[#0d3b66]/25 hover:text-[#f95738]/70 transition-colors disabled:opacity-30"
            title="Refresh recommendations"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        {loading && recommendations.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recommendations.length === 0 ? (
          <p className="text-[#0d3b66]/25 text-[10px] text-center py-4">
            No recommendations yet
          </p>
        ) : (
          recommendations.map((song, i) => (
            <div
              key={song.song_id}
              onClick={() => onSongClick?.(song)}
              className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-[rgba(13,59,102,0.04)] transition-colors cursor-pointer group"
            >
              <span className="text-[#0d3b66]/25 text-[10px] tabular-nums w-3 shrink-0 text-right">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[#0d3b66] text-[11px] font-medium truncate leading-tight">
                  {song.title}
                </p>
                <p className="text-[#0d3b66]/45 text-[10px] truncate leading-tight mt-0.5">
                  {song.artist}
                </p>
              </div>
              <span className="text-[#f95738]/40 text-[8px] uppercase tracking-wider shrink-0 group-hover:text-[#f95738]/70 transition-colors">
                {sourceLabel(song.source)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
