"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import RadarChart from "./RadarChart";
import Timeline from "./Timeline";
import QueueList from "./QueueList";
import SocialSyncCard from "./SocialSyncCard";

interface AnalysisPanelProps {
  onTimeSeek?: (time: number) => void;
}

export default function AnalysisPanel({ onTimeSeek }: AnalysisPanelProps) {
  const [currentTime, setCurrentTime] = useState(42);

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    onTimeSeek?.(time);
  };

  return (
    <motion.aside
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 25,
        delay: 0.15,
      }}
      className="h-full overflow-y-auto overscroll-contain px-6 py-6 space-y-6"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <p className="font-body text-navy/40 text-xs tracking-wide uppercase mb-1">
          Analyzing
        </p>
        <h2 className="font-display text-navy text-2xl font-bold tracking-tight">
          Blonde
        </h2>
        <p className="font-body text-navy/50 text-sm">Frank Ocean</p>
      </motion.div>

      <RadarChart />

      <Timeline currentTime={currentTime} onSeek={handleSeek} />

      <SocialSyncCard />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="glass rounded-2xl p-5"
      >
        <h3 className="font-display text-navy text-lg font-semibold tracking-tight mb-2">
          Overview
        </h3>
        <p className="font-body text-navy/50 text-sm leading-relaxed">
          This music fits a <span className="text-navy font-medium">limbic-dominant</span> profile with
          strong <span className="text-navy font-medium">auditory cortex</span> engagement.
          High introspective alignment suggests deep default-mode network resonance.
        </p>
      </motion.div>

      <QueueList />

      <div className="h-6" />
    </motion.aside>
  );
}
