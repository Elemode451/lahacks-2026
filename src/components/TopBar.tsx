"use client";

import { motion } from "framer-motion";

interface TopBarProps {
  compact: boolean;
}

export default function TopBar({ compact }: TopBarProps) {
  return (
    <motion.header
      layout
      className="relative z-50 flex items-center px-8"
      animate={{
        height: compact ? 56 : 72,
        paddingTop: compact ? 12 : 20,
        paddingBottom: compact ? 12 : 20,
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 25,
      }}
    >
      <motion.div layout className="flex items-center gap-1">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="text-navy"
        >
          <rect x="3" y="6" width="3" height="12" rx="1.5" fill="currentColor" />
          <rect x="8" y="3" width="3" height="18" rx="1.5" fill="currentColor" />
          <rect x="13" y="8" width="3" height="8" rx="1.5" fill="currentColor" />
          <rect x="18" y="5" width="3" height="14" rx="1.5" fill="currentColor" />
        </svg>
        <motion.h1
          layout
          className="font-display font-bold text-navy tracking-tight"
          animate={{
            fontSize: compact ? "22px" : "28px",
          }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        >
          seratune
        </motion.h1>
      </motion.div>
    </motion.header>
  );
}
