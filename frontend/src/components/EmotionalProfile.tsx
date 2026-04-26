"use client";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";

interface Emotion {
  name: string;
  intensity: number;
  level: string;
  description: string;
}

interface EmotionalProfileData {
  emotions?: Emotion[];
  dominant_emotions?: string[];
  summary?: string;
}

interface EmotionalProfileProps {
  emotionalProfile: EmotionalProfileData | null | undefined;
  className?: string;
}

const INTENSITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "rgba(249,87,56,0.12)", text: "#F95738" },
  medium: { bg: "rgba(238,150,75,0.12)", text: "#EE964B" },
  low: { bg: "rgba(244,211,94,0.15)", text: "#b89a2a" },
};

const panelEase = [0.16, 1, 0.3, 1] as const;

export default function EmotionalProfile({
  emotionalProfile,
  className = "",
}: EmotionalProfileProps) {
  if (!emotionalProfile?.emotions?.length) return null;

  const dominant = new Set(emotionalProfile.dominant_emotions ?? []);
  const displayed = emotionalProfile.emotions.filter(
    (e) => e.level === "high" || e.level === "medium" || dominant.has(e.name),
  );
  const seen = new Map<string, Emotion>();
  for (const e of displayed) {
    const existing = seen.get(e.name);
    if (!existing || e.intensity > existing.intensity) {
      seen.set(e.name, e);
    }
  }
  const unique = Array.from(seen.values());

  return (
    <motion.div
      className={`glass-card px-6 py-5 shrink-0 ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.65, ease: panelEase }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-3.5 h-3.5 text-[#0d3b66]/40" />
        <h3 className="section-header">Emotional Response</h3>
      </div>

      {/* Emotion pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {unique.slice(0, 8).map((emotion) => {
          const colors = INTENSITY_COLORS[emotion.level] ?? INTENSITY_COLORS.low;
          return (
            <span
              key={emotion.name}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium"
              style={{
                fontSize: 10,
                lineHeight: "14px",
                letterSpacing: "0.03em",
                background: colors.bg,
                color: colors.text,
              }}
              title={emotion.description}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: colors.text }}
              />
              {emotion.name}
            </span>
          );
        })}
      </div>

      {/* Summary text */}
      {emotionalProfile.summary && (
        <p
          className="text-[#0d3b66]/50 leading-relaxed"
          style={{ fontSize: 10.5 }}
        >
          {emotionalProfile.summary}
        </p>
      )}
    </motion.div>
  );
}
