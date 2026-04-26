"use client";

import { motion } from "framer-motion";
import RadarChart from "./RadarChart";

interface AnalysisPanelProps {
  onTimeSeek?: (time: number) => void;
}

export default function AnalysisPanel({ onTimeSeek: _ }: AnalysisPanelProps) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 200, damping: 25, delay: 0.2 }}
      className="h-full overflow-y-auto"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {/* Radar chart — matches Figma y=53 from panel top, max 408px wide */}
      <div className="pt-[53px] px-8 flex justify-center">
        <div className="max-w-[408px] w-full">
          <RadarChart />
        </div>
      </div>

      {/* Overview text — ~79px below chart bottom */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="px-8 pt-20 pb-10"
      >
        <p className="font-body text-navy/40 text-sm mb-3 tracking-wide">
          overview:
        </p>
        <p className="font-body text-navy text-sm leading-relaxed" style={{ letterSpacing: "-0.035em" }}>
          This music fits a{" "}
          <span className="text-navy font-medium">limbic-dominant</span> profile
          with strong{" "}
          <span className="text-navy font-medium">auditory cortex</span>{" "}
          engagement. High introspective alignment suggests deep default-mode
          network resonance characteristic of emotional processing music.
        </p>
      </motion.div>
    </motion.aside>
  );
}
