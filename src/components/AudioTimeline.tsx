"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const BAR_COUNT = 72;

// Deterministic waveform shape — envelope-modulated pseudo-random heights
const barHeights = Array.from({ length: BAR_COUNT }, (_, i) => {
  const r = Math.abs(Math.sin(i * 2.3999632) * Math.cos(i * 0.7530));
  const env = Math.pow(Math.sin((i / BAR_COUNT) * Math.PI), 0.45);
  return Math.max(0.08, Math.min(1, r * env + 0.08));
});

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

interface AudioTimelineProps {
  duration?: number;
  className?: string;
}

export default function AudioTimeline({
  duration = 214,
  className = "",
}: AudioTimelineProps) {
  const [position, setPosition] = useState(0); // 0–1
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const tick = useCallback(
    (ts: number) => {
      if (lastTsRef.current !== null) {
        const dt = (ts - lastTsRef.current) / 1000;
        setPosition((p) => {
          const next = p + dt / duration;
          if (next >= 1) { setIsPlaying(false); return 1; }
          return next;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    },
    [duration]
  );

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, tick]);

  const seekTo = useCallback((clientX: number) => {
    const el = waveRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    setPosition(Math.max(0, Math.min(1, (clientX - left) / width)));
  }, []);

  const cursorIdx = Math.round(position * (BAR_COUNT - 1));

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="text-[#0d3b66]/40 text-[9px] tabular-nums font-semibold tracking-[0.06em] uppercase">
          {fmt(position * duration)}
        </span>

        {/* Minimal play / pause glyph */}
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
        onPointerMove={(e) => { if (dragging.current) seekTo(e.clientX); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        {barHeights.map((h, i) => {
          const filled = i < cursorIdx;
          const isCursor = i === cursorIdx;
          return (
            <div
              key={i}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${h * 100}%`,
                background: isCursor
                  ? "#f95738"
                  : filled
                  ? "rgba(249,87,56,0.55)"
                  : "rgba(13,59,102,0.12)",
                transition: "background 60ms linear",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
