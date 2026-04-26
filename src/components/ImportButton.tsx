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
      className="cursor-pointer flex items-center gap-2.5 font-body font-semibold text-heatmap-hot rounded-full"
      style={{
        background: "rgba(249, 87, 56, 0.2)",
        backdropFilter: "blur(48px)",
        WebkitBackdropFilter: "blur(48px)",
        border: "1px solid rgba(249, 87, 56, 0.15)",
        height: 50,
        paddingLeft: 20,
        paddingRight: 20,
        fontSize: 20,
        letterSpacing: "-0.04em",
        minWidth: 140,
      }}
      whileHover={{ scale: 1.03, backgroundColor: "rgba(249, 87, 56, 0.26)" }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <span>import</span>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <line x1="3" y1="12" x2="3" y2="12" strokeWidth="3" />
        <line x1="6.5" y1="8" x2="6.5" y2="16" />
        <line x1="10" y1="5" x2="10" y2="19" />
        <line x1="13.5" y1="7" x2="13.5" y2="17" />
        <line x1="17" y1="9" x2="17" y2="15" />
        <line x1="20.5" y1="11" x2="20.5" y2="13" strokeWidth="3" />
      </svg>
    </motion.button>
  );
}
