"use client";

import { motion } from "framer-motion";

interface SocialSyncCardProps {
  friendName?: string;
  overlap?: number;
}

export default function SocialSyncCard({
  friendName = "Alex Chen",
  overlap = 87,
}: SocialSyncCardProps) {
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (overlap / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="glass rounded-2xl p-5"
    >
      <h3 className="font-display text-navy text-lg font-semibold tracking-tight mb-3">
        Social Sync
      </h3>
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 flex-shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#0d3b66"
              strokeOpacity={0.06}
              strokeWidth={3}
            />
            <motion.circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#f95738"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.7 }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-body text-navy text-xs font-bold">
            {overlap}%
          </span>
        </div>
        <div>
          <p className="font-body text-navy text-sm">
            <span className="font-semibold">{overlap}%</span>{" "}
            <span className="text-navy/50">Cortical Overlap with</span>
          </p>
          <p className="font-body text-navy font-semibold text-sm">
            {friendName}
          </p>
          <p className="font-body text-navy/30 text-xs mt-0.5">
            Taste vectors intersect across limbic and auditory regions
          </p>
        </div>
      </div>
    </motion.div>
  );
}
