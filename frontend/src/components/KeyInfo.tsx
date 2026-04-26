"use client";

import { Music } from "lucide-react";

interface KeyInfoData {
  key_name: string;
  tempo?: number | null;
  mood?: string;
}

interface KeyComparisonData {
  song_a: string;
  song_b: string;
  distance: number;
  relationship: string;
  description: string;
}

interface KeyAnalysisData {
  song_keys?: Record<string, KeyInfoData>;
  pairwise_key_comparisons?: KeyComparisonData[];
  summary?: string;
}

interface KeyInfoDisplayProps {
  className?: string;
  analysisResult: Record<string, unknown> | null;
}

export default function KeyInfoDisplay({
  className = "",
  analysisResult,
}: KeyInfoDisplayProps) {
  if (!analysisResult) return null;

  const keyAnalysis = analysisResult.key_analysis as KeyAnalysisData | undefined;

  // Single song: check song.key_info
  const song = analysisResult.song as Record<string, unknown> | undefined;
  const singleKeyInfo = song?.key_info as KeyInfoData | undefined;

  // Multi-song: check songs[].key_info
  const songs = analysisResult.songs as Array<Record<string, unknown>> | undefined;

  // Collect all key infos
  const keyInfos: Array<{ title: string; info: KeyInfoData }> = [];

  if (singleKeyInfo?.key_name) {
    keyInfos.push({
      title: (song?.title as string) ?? "Track",
      info: singleKeyInfo,
    });
  } else if (songs) {
    for (const s of songs) {
      const ki = s.key_info as KeyInfoData | undefined;
      if (ki?.key_name) {
        keyInfos.push({
          title: (s.title as string) ?? "Unknown",
          info: ki,
        });
      }
    }
  }

  if (keyInfos.length === 0 && !keyAnalysis?.summary) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <Music className="w-3 h-3 text-[#f95738]/50" />
        <span className="text-[#0d3b66]/35 text-[9px] tracking-[0.12em] uppercase font-semibold">
          music theory
        </span>
      </div>

      {/* Key badges */}
      <div className="flex flex-wrap gap-1.5">
        {keyInfos.map(({ title, info }) => (
          <div
            key={title}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(13,59,102,0.06)] border border-[rgba(13,59,102,0.08)]"
          >
            <span className="text-[#0d3b66] text-[10px] font-semibold">
              {info.key_name}
            </span>
            {info.tempo && (
              <span className="text-[#0d3b66]/40 text-[9px]">
                {Math.round(info.tempo)} BPM
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Key mood (single song) */}
      {keyInfos.length === 1 && keyInfos[0].info.mood && (
        <p className="text-[#0d3b66]/45 text-[10px] leading-tight">
          {keyInfos[0].info.mood}
        </p>
      )}

      {/* Key analysis summary (multi-song) */}
      {keyAnalysis?.summary && (
        <p className="text-[#0d3b66]/45 text-[10px] leading-tight">
          {keyAnalysis.summary}
        </p>
      )}

      {/* Pairwise comparisons (show first 3) */}
      {keyAnalysis?.pairwise_key_comparisons &&
        keyAnalysis.pairwise_key_comparisons.length > 0 && (
          <div className="flex flex-col gap-0.5 mt-0.5">
            {keyAnalysis.pairwise_key_comparisons.slice(0, 3).map((comp, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    comp.distance <= 1
                      ? "bg-emerald-400"
                      : comp.distance <= 3
                        ? "bg-amber-400"
                        : "bg-red-400"
                  }`}
                />
                <span className="text-[#0d3b66]/40 text-[9px] leading-tight truncate">
                  {comp.relationship}
                </span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
