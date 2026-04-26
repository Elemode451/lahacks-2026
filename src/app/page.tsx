"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import ImportButton from "@/components/ImportButton";
import ImportOverlay from "@/components/ImportOverlay";
import AnalysisPanel from "@/components/AnalysisPanel";
import HeadSilhouette from "@/components/HeadSilhouette";
import ColorBends, { type ColorBendsHandle } from "@/components/ColorBends";

const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
});

type Phase = "landing" | "importing" | "processing" | "dashboard";

const spring = {
  type: "spring" as const,
  stiffness: 200,
  damping: 28,
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [brainFlashing, setBrainFlashing] = useState(false);
  const [timePosition, setTimePosition] = useState(0);
  const colorBendsRef = useRef<ColorBendsHandle>(null);

  const isDashboard = phase === "dashboard";
  const isLanding = phase === "landing";

  const handleImportClick = useCallback(() => setPhase("importing"), []);
  const handleImportClose = useCallback(() => setPhase("landing"), []);

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
      <div className="h-full relative overflow-hidden bg-bg">
        {/* Color Bends — full-bleed background, always present */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <ColorBends
            ref={colorBendsRef}
            colors={["#0d3b66", "#1a5a96", "#2470b8", "#4a88cc", "#8ab8e0", "#c4dcf4"]}
            speed={0.025}
            frequency={0.2}
            warpStrength={0.16}
            scale={2.2}
            intensity={0.82}
            noise={0.025}
            iterations={2}
            bandWidth={7}
            transparent={false}
            mouseInfluence={0.015}
            parallax={0.04}
          />
        </div>

        {/* Right cream panel — covers color bends on dashboard right side */}
        <AnimatePresence>
          {isDashboard && (
            <motion.div
              className="absolute right-0 top-0 h-full bg-bg z-[1]"
              initial={{ width: 0 }}
              animate={{ width: "50%" }}
              exit={{ width: 0 }}
              transition={spring}
            />
          )}
        </AnimatePresence>

        {/* Main layout */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header — cream bg on landing/importing, transparent on dashboard */}
          <motion.header
            className="relative flex-shrink-0"
            style={{ height: 93 }}
            animate={{
              backgroundColor: isDashboard
                ? "rgba(255, 253, 245, 0)"
                : "rgba(255, 253, 245, 1)",
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Logo — bottom of topbar, 14% from left (Figma: x=182/1280) */}
            <div className="absolute bottom-0 left-[14%] pb-2">
              <TopBar />
            </div>

            {/* Import button — top right, landing phase only */}
            <AnimatePresence>
              {isLanding && (
                <motion.div
                  className="absolute right-[18%] top-1/2 -translate-y-1/2"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={spring}
                >
                  <ImportButton onClick={handleImportClick} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.header>

          {/* Content area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left — Brain visualization */}
            <motion.div
              className="relative flex items-center justify-center flex-shrink-0 h-full"
              animate={{ width: isDashboard ? "50%" : "100%" }}
              transition={spring}
            >
              <motion.div
                className={`absolute ${brainFlashing ? "brain-flash" : ""}`}
                animate={{
                  width: isDashboard ? "88%" : "min(70%, 580px)",
                  height: isDashboard ? "93%" : "95%",
                }}
                transition={spring}
              >
                {/* Head silhouette behind 3D brain */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <HeadSilhouette className="w-[58%]" />
                </div>
                <BrainScene
                  className="w-full h-full"
                  flashing={brainFlashing}
                  interactive={isDashboard}
                  timePosition={timePosition}
                />
              </motion.div>
            </motion.div>

            {/* Right — Analysis panel (dashboard only) */}
            <AnimatePresence>
              {isDashboard && (
                <motion.div
                  className="w-1/2 overflow-hidden flex-shrink-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, delay: 0.25 }}
                >
                  <AnalysisPanel onTimeSeek={handleTimeSeek} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Import overlay */}
        <AnimatePresence>
          {phase === "importing" && (
            <ImportOverlay
              onConfirm={handleConfirm}
              onClose={handleImportClose}
            />
          )}
        </AnimatePresence>

        {/* Processing overlay */}
        <AnimatePresence>
          {phase === "processing" && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{
                backgroundColor: "rgba(255, 253, 245, 0.7)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
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
                <p className="font-body text-navy/50 text-sm tracking-widest uppercase">
                  Extracting TRIBE v2 cortical fingerprints
                </p>
                <div className="mt-5 flex justify-center gap-1.5">
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
    </LayoutGroup>
  );
}
