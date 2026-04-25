"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import HeadSilhouette from "@/components/HeadSilhouette";
import ImportButton from "@/components/ImportButton";
import ImportOverlay from "@/components/ImportOverlay";
import AnalysisPanel from "@/components/AnalysisPanel";
import ColorBends, { type ColorBendsHandle } from "@/components/ColorBends";

const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
});

type Phase = "landing" | "importing" | "processing" | "dashboard";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [brainFlashing, setBrainFlashing] = useState(false);
  const [timePosition, setTimePosition] = useState(0);
  const colorBendsRef = useRef<ColorBendsHandle>(null);

  const isDashboard = phase === "dashboard";

  const handleImportClick = useCallback(() => {
    setPhase("importing");
  }, []);

  const handleImportClose = useCallback(() => {
    setPhase("landing");
  }, []);

  const handleConfirm = useCallback(() => {
    setPhase("processing");
    setBrainFlashing(true);

    setTimeout(() => {
      setBrainFlashing(false);
      setPhase("dashboard");
    }, 1200);
  }, []);

  const handleTimeSeek = useCallback((time: number) => {
    setTimePosition(time / 210);
  }, []);

  return (
    <LayoutGroup>
      <div className="h-full flex flex-col relative overflow-hidden bg-bg">
        {/* Color Bends Background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <ColorBends
            ref={colorBendsRef}
            colors={["#FFFDF5", "#e8e4d9", "#d4cfc3", "#0d3b66"]}
            speed={0.08}
            frequency={0.6}
            warpStrength={0.3}
            scale={1.8}
            intensity={1.2}
            noise={0.05}
            iterations={2}
            bandWidth={4}
            transparent={false}
            mouseInfluence={0.3}
            parallax={0.2}
          />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <TopBar compact={isDashboard} />

          <div className="flex-1 flex relative overflow-hidden">
            {/* Left: Brain Visualization */}
            <motion.div
              layout
              className="relative flex items-center justify-center"
              animate={{
                width: isDashboard ? "55%" : "100%",
              }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 25,
              }}
            >
              {/* Head Silhouette */}
              <motion.div
                layout
                className="absolute"
                animate={{
                  width: isDashboard ? "70%" : "55%",
                  height: isDashboard ? "85%" : "80%",
                  x: isDashboard ? "-5%" : "5%",
                }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 25,
                }}
              >
                <HeadSilhouette className="w-full h-full opacity-95" />
              </motion.div>

              {/* 3D Brain */}
              <motion.div
                layout
                className={`absolute ${brainFlashing ? "brain-flash" : ""}`}
                animate={{
                  width: isDashboard ? "45%" : "35%",
                  height: isDashboard ? "55%" : "50%",
                  x: isDashboard ? "10%" : "15%",
                  y: isDashboard ? "-8%" : "-5%",
                }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 25,
                }}
              >
                <BrainScene
                  className="w-full h-full"
                  flashing={brainFlashing}
                  interactive={isDashboard}
                  timePosition={timePosition}
                />
              </motion.div>

              {/* Import Button */}
              <AnimatePresence>
                {phase === "landing" && (
                  <motion.div
                    className="absolute z-30"
                    style={{ top: "18%", right: "22%" }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                    }}
                  >
                    <ImportButton onClick={handleImportClick} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Right: Analysis Panel */}
            <AnimatePresence>
              {isDashboard && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "45%", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 25,
                  }}
                  className="relative border-l border-navy/[0.06] bg-bg/80 backdrop-blur-sm"
                >
                  <AnalysisPanel onTimeSeek={handleTimeSeek} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Import Overlay */}
          <AnimatePresence>
            {phase === "importing" && (
              <ImportOverlay
                onConfirm={handleConfirm}
                onClose={handleImportClose}
              />
            )}
          </AnimatePresence>

          {/* Processing Overlay */}
          <AnimatePresence>
            {phase === "processing" && (
              <motion.div
                className="fixed inset-0 z-40 flex items-center justify-center"
                style={{
                  backgroundColor: "rgba(255, 253, 245, 0.6)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="text-center"
                >
                  <p className="font-body text-navy/60 text-sm tracking-wide">
                    Extracting TRIBE v2 cortical fingerprints...
                  </p>
                  <div className="mt-4 flex justify-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-heatmap-hot"
                        animate={{
                          opacity: [0.2, 1, 0.2],
                          scale: [0.8, 1.2, 0.8],
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.15,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </LayoutGroup>
  );
}
