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

const springTransition = {
  type: "spring" as const,
  stiffness: 200,
  damping: 25,
};

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
        {/* Color Bends Background — rendered after brain to avoid WebGL context conflicts */}
        {isDashboard && (
          <div className="absolute inset-0 z-0 pointer-events-none opacity-15">
            <ColorBends
              ref={colorBendsRef}
              colors={["#FFFDF5", "#f5f0e4", "#ede5d4", "#e0d8c8"]}
              speed={0.04}
              frequency={0.3}
              warpStrength={0.15}
              scale={2.2}
              intensity={0.8}
              noise={0.02}
              iterations={2}
              bandWidth={6}
              transparent={false}
              mouseInfluence={0.15}
              parallax={0.1}
            />
          </div>
        )}

        <div className="relative z-10 flex flex-col h-full">
          <TopBar compact={isDashboard} />

          <div className="flex-1 flex relative overflow-hidden">
            {/* Left: Brain Visualization Area */}
            <div
              className="relative flex items-center justify-center transition-all duration-700"
              style={{
                width: isDashboard ? "55%" : "100%",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              {/* Head Silhouette — centered in container */}
              <div
                className="absolute transition-all duration-700"
                style={{
                  width: isDashboard ? "75%" : "min(50%, 420px)",
                  height: isDashboard ? "90%" : "85%",
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <HeadSilhouette className="w-full h-full opacity-95" />
              </div>

              {/* 3D Brain — overlapping the cranium area */}
              <div
                className={`absolute z-10 transition-all duration-700 ${brainFlashing ? "brain-flash" : ""}`}
                style={{
                  width: isDashboard ? "28%" : "min(20%, 170px)",
                  height: isDashboard ? "35%" : "30%",
                  marginTop: isDashboard ? "-14%" : "-16%",
                  marginLeft: isDashboard ? "2%" : "3%",
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <BrainScene
                  className="w-full h-full"
                  flashing={brainFlashing}
                  interactive={isDashboard}
                  timePosition={timePosition}
                />
              </div>

              {/* Import Button — centered below head */}
              <AnimatePresence>
                {phase === "landing" && (
                  <motion.div
                    className="absolute z-30"
                    style={{ bottom: "8%", left: "50%", transform: "translateX(-50%)" }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={springTransition}
                  >
                    <ImportButton onClick={handleImportClick} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: Analysis Panel */}
            <AnimatePresence>
              {isDashboard && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "45%", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={springTransition}
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
