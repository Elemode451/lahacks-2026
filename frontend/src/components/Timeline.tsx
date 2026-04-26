"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";

interface TimelineProps {
  duration?: number;
  activationData?: number[];
  onSeek?: (position: number) => void;
  currentTime?: number;
}

function generateActivationData(count: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const base = 0.3 + 0.2 * Math.sin(t * Math.PI * 2);
    const detail = 0.15 * Math.sin(t * Math.PI * 7) + 0.1 * Math.sin(t * Math.PI * 13);
    const peak = t > 0.3 && t < 0.5 ? 0.3 * Math.sin((t - 0.3) * Math.PI / 0.2) : 0;
    const peak2 = t > 0.7 && t < 0.85 ? 0.25 * Math.sin((t - 0.7) * Math.PI / 0.15) : 0;
    data.push(Math.max(0.05, Math.min(1, base + detail + peak + peak2)));
  }
  return data;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Timeline({
  duration = 210,
  activationData,
  onSeek,
  currentTime = 0,
}: TimelineProps) {
  const barCount = 80;
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const data = activationData ?? generateActivationData(barCount);
  const normalizedData = data.length === barCount ? data : generateActivationData(barCount);
  const progress = currentTime / duration;

  const handleInteraction = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek?.(x * duration);
    },
    [duration, onSeek]
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => handleInteraction(e.clientX);
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, handleInteraction]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-navy text-lg font-semibold tracking-tight">
          Timeline
        </h3>
        <span className="font-body text-navy/40 text-xs">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative flex items-end gap-[1px] h-16 cursor-pointer select-none"
        onMouseDown={(e) => {
          setIsDragging(true);
          handleInteraction(e.clientX);
        }}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const idx = Math.floor(
              ((e.clientX - rect.left) / rect.width) * barCount
            );
            setHoveredBar(Math.max(0, Math.min(barCount - 1, idx)));
          }
        }}
        onMouseLeave={() => setHoveredBar(null)}
      >
        {normalizedData.map((value, i) => {
          const barProgress = i / barCount;
          const isPast = barProgress <= progress;
          const isHovered = hoveredBar === i;

          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-150"
              style={{
                height: `${Math.max(8, value * 100)}%`,
                backgroundColor: isPast
                  ? isHovered
                    ? "#f95738"
                    : `rgba(249, 87, 56, ${0.4 + value * 0.6})`
                  : isHovered
                  ? "rgba(13, 59, 102, 0.3)"
                  : `rgba(13, 59, 102, ${0.06 + value * 0.12})`,
                transform: isHovered ? "scaleY(1.15)" : "scaleY(1)",
                transformOrigin: "bottom",
              }}
            />
          );
        })}

        <div
          className="absolute top-0 bottom-0 w-[2px] bg-heatmap-hot rounded-full shadow-sm pointer-events-none"
          style={{ left: `${progress * 100}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-heatmap-hot shadow-md" />
        </div>
      </div>

      {hoveredBar !== null && (
        <div className="flex justify-end mt-1">
          <span className="font-body text-navy/30 text-[10px]">
            activation: {(normalizedData[hoveredBar] * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}
