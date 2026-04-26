"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Radio, Link as LinkIcon } from "lucide-react";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { apiFetch } from "@/lib/api";
import { SeratoneLogo } from "@/components/Icons";

const BrainScene = dynamic(() => import("@/components/BrainScene"), { ssr: false });
const MusicRadarChart = dynamic(() => import("@/components/MusicRadarChart"), { ssr: false });
const AudioTimeline = dynamic(() => import("@/components/AudioTimeline"), { ssr: false });

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

export default function SharedAnalysisPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [fingerprints, setFingerprints] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSegment, setCurrentSegment] = useState(0);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      try {
        const res = await apiFetch(`/share/${slug}`);
        if (!res.ok) {
          setError(res.status === 404 ? "This shared analysis was not found." : "Failed to load analysis.");
          return;
        }
        const data = await res.json();
        setAnalysis(data);

        // Try to load fingerprints for 3D brain visualization
        if (data.analysis_id) {
          try {
            const fpRes = await apiFetch(`/analyses/${data.analysis_id}/fingerprints`);
            if (fpRes.ok) {
              setFingerprints(await fpRes.json());
            }
          } catch {
            // Fingerprints optional — analysis still viewable
          }
        }
      } catch {
        setError("Failed to load shared analysis.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const payload = analysis?.payload as Record<string, unknown> | undefined;

  const fingerprint = useMemo(() => {
    const b64 = (fingerprints?.combined_fingerprint_b64 ?? payload?.combined_fingerprint_b64) as string | undefined;
    return b64 ? decodeB64Float32(b64) : null;
  }, [fingerprints, payload]);

  const temporalData = useMemo(() => {
    const b64 = (fingerprints?.temporal_fingerprints_b64 ?? payload?.temporal_fingerprints_b64) as string | undefined;
    return b64 ? decodeB64Float32(b64) : null;
  }, [fingerprints, payload]);

  const timelineActivations = useMemo(() => {
    const timeline = (fingerprints?.combined_timeline ?? payload?.combined_timeline) as Array<Record<string, number>> | undefined;
    if (!timeline || timeline.length === 0) return undefined;
    return timeline.map((seg) => seg.whole_cortex ?? 0);
  }, [fingerprints, payload]);

  const radarData = useMemo(() => {
    const scores = (fingerprints?.combined_region_scores ?? payload?.combined_region_scores) as Record<string, number> | undefined;
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
    if (range === 0) return entries.map((e) => ({ attribute: e.attribute, value: 50 }));
    return entries.map((e) => ({ attribute: e.attribute, value: Math.round(15 + ((e.value - min) / range) * 85) }));
  }, [fingerprints, payload]);

  const peakSegment = (fingerprints?.peak_segment ?? payload?.peak_segment) as number | undefined;

  const title = analysis?.title as string ?? "Shared Analysis";
  const vibeDescription = (fingerprints?.vibe_description ?? payload?.vibe_description ?? payload?.summary) as string | undefined;

  const songs = payload?.songs as Array<{ title?: string; artist?: string }> | undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffdf5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#0d3b66]/40 text-sm">Loading shared analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#fffdf5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-[rgba(249,87,56,0.08)] flex items-center justify-center">
            <LinkIcon className="w-6 h-6 text-[#f95738]/50" />
          </div>
          <p className="text-[#0d3b66] font-medium">{error}</p>
          <NextLink href="/" className="text-[#f95738] text-sm hover:underline">Go to Seratone →</NextLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffdf5] font-sans selection:bg-[#f95738] selection:text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-[rgba(13,59,102,0.06)]">
        <NextLink href="/">
          <SeratoneLogo className="h-8 w-auto opacity-70 hover:opacity-100 transition-opacity" />
        </NextLink>
        <span className="text-[#0d3b66]/30 text-[9px] uppercase tracking-[0.15em] font-semibold">
          shared analysis
        </span>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-10">
        <motion.h1
          className="text-[#0d3b66] text-2xl font-semibold tracking-tight mb-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {title}
        </motion.h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Brain visualization */}
          <motion.div
            className="aspect-square max-h-[500px] rounded-3xl overflow-hidden bg-[rgba(13,59,102,0.02)] border border-[rgba(13,59,102,0.06)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <BrainScene
              className="w-full h-full"
              interactive
              fingerprint={fingerprint}
              temporalData={temporalData}
              segmentIndex={currentSegment}
            />
          </motion.div>

          {/* Analysis details */}
          <div className="flex flex-col gap-5">
            {/* Timeline */}
            {timelineActivations && (
              <motion.div
                className="glass-card px-6 py-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Radio className="w-3.5 h-3.5 text-[#0d3b66]/40" />
                  <h3 className="text-[#0d3b66]/35 text-[9px] tracking-[0.12em] uppercase font-semibold">Timeline</h3>
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
            )}

            {/* Radar chart */}
            {radarData && (
              <motion.div
                className="glass-card px-6 py-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-3.5 h-3.5 text-[#0d3b66]/40" />
                  <h3 className="text-[#0d3b66]/35 text-[9px] tracking-[0.12em] uppercase font-semibold">Cortical Profile</h3>
                </div>
                <div className="flex justify-center">
                  <MusicRadarChart data={radarData} className="w-full max-w-[340px]" style={{ height: "220px" }} />
                </div>
              </motion.div>
            )}

            {/* Overview */}
            {vibeDescription && (
              <motion.div
                className="glass-card px-6 py-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <p className="text-[#0d3b66]/40 text-[9px] tracking-[0.12em] uppercase font-semibold mb-2">Overview</p>
                <p className="text-[#0d3b66] text-sm leading-relaxed" style={{ letterSpacing: "-0.02em" }}>
                  {vibeDescription}
                </p>
              </motion.div>
            )}

            {/* Songs list */}
            {songs && songs.length > 0 && (
              <motion.div
                className="glass-card px-6 py-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <p className="text-[#0d3b66]/40 text-[9px] tracking-[0.12em] uppercase font-semibold mb-3">Songs Analyzed</p>
                <div className="flex flex-col gap-2">
                  {songs.map((song, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[rgba(13,59,102,0.02)]">
                      <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[rgba(249,87,56,0.08)] to-[rgba(238,150,75,0.1)] flex items-center justify-center shrink-0">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#f95738]/40">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[#0d3b66] text-[11px] font-medium truncate">{song.title ?? "Unknown"}</p>
                        <p className="text-[#0d3b66]/35 text-[10px] truncate">{song.artist ?? "Unknown"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
