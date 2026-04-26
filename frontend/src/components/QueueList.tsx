"use client";

import { motion } from "framer-motion";

interface Track {
  title: string;
  artist: string;
  similarity: number;
}

interface QueueListProps {
  tracks?: Track[];
}

const DEMO_TRACKS: Track[] = [
  { title: "Nights", artist: "Frank Ocean", similarity: 0.94 },
  { title: "Self Control", artist: "Frank Ocean", similarity: 0.91 },
  { title: "Pink + White", artist: "Frank Ocean", similarity: 0.88 },
  { title: "Ivy", artist: "Frank Ocean", similarity: 0.85 },
  { title: "Godspeed", artist: "Frank Ocean", similarity: 0.82 },
  { title: "Seigfried", artist: "Frank Ocean", similarity: 0.79 },
];

export default function QueueList({ tracks = DEMO_TRACKS }: QueueListProps) {
  return (
    <div className="w-full">
      <h3 className="font-display text-navy text-lg font-semibold tracking-tight mb-3">
        Queue
      </h3>
      <div className="space-y-1">
        {tracks.map((track, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.7 + i * 0.06,
            }}
            className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-navy/[0.03] transition-colors duration-200 cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-body text-navy/20 text-xs w-5 text-right flex-shrink-0 group-hover:text-heatmap-hot/50 transition-colors">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-body text-navy text-sm font-medium truncate">
                  {track.title}
                </p>
                <p className="font-body text-navy/40 text-xs truncate">
                  {track.artist}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              <div className="w-12 h-1 rounded-full bg-navy/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-heatmap-hot"
                  initial={{ width: 0 }}
                  animate={{ width: `${track.similarity * 100}%` }}
                  transition={{ duration: 0.8, delay: 0.9 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="font-body text-navy/30 text-[10px] w-8 text-right">
                {(track.similarity * 100).toFixed(0)}%
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
