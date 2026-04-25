"use client";

import { motion } from "framer-motion";

interface ImportButtonProps {
  onClick: () => void;
}

export default function ImportButton({ onClick }: ImportButtonProps) {
  return (
    <motion.button
      layoutId="import-container"
      onClick={onClick}
      className="glass cursor-pointer flex items-center gap-2.5 rounded-full px-5 py-2.5 text-heatmap-hot font-body font-semibold text-sm tracking-wide hover:scale-[1.03] active:scale-[0.98]"
      style={{
        boxShadow:
          "0 4px 24px rgba(249, 87, 56, 0.12), 0 1px 4px rgba(0,0,0,0.04)",
      }}
      whileHover={{
        boxShadow:
          "0 6px 32px rgba(249, 87, 56, 0.18), 0 2px 8px rgba(0,0,0,0.06)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <span>import</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 10v3a1 1 0 0 0 1 1h3" />
        <path d="M22 10v3a1 1 0 0 1-1 1h-3" />
        <path d="M2 10V7a1 1 0 0 1 1-1h3" />
        <path d="M22 10V7a1 1 0 0 0-1-1h-3" />
        <line x1="8" y1="10" x2="8" y2="10.01" />
        <line x1="12" y1="10" x2="12" y2="10.01" />
        <line x1="16" y1="10" x2="16" y2="10.01" />
      </svg>
    </motion.button>
  );
}
