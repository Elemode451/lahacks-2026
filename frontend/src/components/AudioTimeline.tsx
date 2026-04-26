"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const DEFAULT_BAR_COUNT = 30;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

interface AudioTimelineProps {
  duration?: number;
  segmentActivations?: number[];
  peakIndex?: number;
  currentIndex?: number;
  onSegmentChange?: (index: number) => void;
  className?: string;
}

export default function AudioTimeline({
  duration = 214,
  segmentActivations,
  peakIndex,
  currentIndex,
  onSegmentChange,
  className = "",
}: AudioTimelineProps) {
  const barCount = segmentActivations?.length ?? DEFAULT_BAR_COUNT;

  // Normalize activations to 0–1 range for bar heights
  const barHeights = (() => {
    if (!segmentActivations || segmentActivations.length === 0) {
      // Fallback: deterministic decorative waveform
      return Array.from({ length: barCount }, (_, i) => {
        const r = Math.abs(Math.sin(i * 2.3999632) * Math.cos(i * 0.7530));
        const env = Math.pow(Math.sin((i / barCount) * Math.PI), 0.45);
        return Math.max(0.08, Math.min(1, r * env + 0.08));
      });
    }
    const max = Math.max(...segmentActivations);
    const min = Math.min(...segmentActivations);
    const range = max - min || 1;
    return segmentActivations.map((v) =>
      Math.max(0.08, (v - min) / range),
    );
  })();

  // Controlled mode: use currentIndex prop; uncontrolled mode: local state
  const controlled = currentIndex != null && onSegmentChange != null;
  const [localIndex, setLocalIndex] = useState(0);
  const activeIndex = controlled ? currentIndex : localIndex;

  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const fracRef = useRef(0); // fractional accumulator for smooth playback
  const waveRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Store latest callback deps in a ref so the rAF loop never goes stale
  const tickDepsRef = useRef({ duration, barCount, controlled, currentIndex, onSegmentChange });
  useEffect(() => {
    tickDepsRef.current = { duration, barCount, controlled, currentIndex, onSegmentChange };
  });

  useEffect(() => {
    if (!isPlaying) {
      lastTsRef.current = null;
      return;
    }

    fracRef.current = controlled ? (currentIndex ?? 0) : localIndex;

    const loop = (ts: number) => {
      const { duration: dur, barCount: bc, controlled: ctrl, onSegmentChange: osc } = tickDepsRef.current;
      if (lastTsRef.current !== null) {
        const dt = (ts - lastTsRef.current) / 1000;
        const advance = dt / (dur / bc);
        fracRef.current += advance;

        if (fracRef.current >= bc - 1) {
          fracRef.current = bc - 1;
          setIsPlaying(false);
        }

        const rounded = Math.round(fracRef.current);
        if (ctrl && osc) {
          osc(rounded);
        } else {
          setLocalIndex(rounded);
        }
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const seekTo = useCallback(
    (clientX: number) => {
      const el = waveRef.current;
      if (!el) return;
      const { left, width } = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
      const idx = Math.round(ratio * (barCount - 1));
      fracRef.current = idx;
      if (controlled) {
        onSegmentChange(idx);
      } else {
        setLocalIndex(idx);
      }
    },
    [barCount, controlled, onSegmentChange],
  );

  const position = barCount > 1 ? activeIndex / (barCount - 1) : 0;

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-[#0d3b66]/40 text-[9px] tabular-nums font-semibold tracking-[0.06em] uppercase">
          {fmt(position * duration)}
        </span>

        <button
          onClick={() => setIsPlaying((p) => !p)}
          className="text-[#f95738]/70 hover:text-[#f95738] transition-colors cursor-pointer"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <rect x="0" y="0" width="3" height="12" rx="1" />
              <rect x="7" y="0" width="3" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <path d="M1 0.5L10 6L1 11.5V0.5Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Waveform */}
      <div
        ref={waveRef}
        className="flex items-end gap-[2px] h-10 w-full cursor-pointer"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) seekTo(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        {barHeights.map((h, i) => {
          const filled = i < activeIndex;
          const isCursor = i === activeIndex;
          const isPeak = i === peakIndex;
          return (
            <div
              key={i}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${h * 100}%`,
                background: isCursor
                  ? "#f95738"
                  : isPeak && !filled
                    ? "rgba(249,87,56,0.35)"
                    : filled
                      ? "rgba(249,87,56,0.55)"
                      : "rgba(13,59,102,0.12)",
                transition: "background 60ms linear",
                boxShadow: isPeak ? "0 0 4px rgba(249,87,56,0.3)" : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
