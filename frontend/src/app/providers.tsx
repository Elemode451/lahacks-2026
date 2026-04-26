"use client";

import { AuthProvider } from "@/lib/auth-context";
import type { ReactNode } from "react";
import { createContext, useContext, useCallback, useRef } from "react";
import { animate } from "framer-motion";
import ColorBends, { type ColorBendsHandle } from "@/components/ColorBends";

type ColorMode = "orange" | "blue";

interface BgContextValue {
  setColorMode: (mode: ColorMode) => void;
}

const BgContext = createContext<BgContextValue>({ setColorMode: () => {} });

export function useAppBackground() {
  return useContext(BgContext);
}

const ORANGE_COLORS = ["#f95738", "#ee964b"];
const BLUE_COLORS = ["#0D3B66", "#0D3B66"];

function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const hex = h.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bv = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

export function Providers({ children }: { children: ReactNode }) {
  const colorBendsRef = useRef<ColorBendsHandle>(null);
  const modeRef = useRef<ColorMode>("orange");
  const animControls = useRef<{ stop: () => void } | null>(null);

  const setColorMode = useCallback((mode: ColorMode) => {
    if (modeRef.current === mode) return;
    const from = modeRef.current;
    modeRef.current = mode;
    animControls.current?.stop();
    const fromColors = from === "orange" ? ORANGE_COLORS : BLUE_COLORS;
    const toColors = mode === "orange" ? ORANGE_COLORS : BLUE_COLORS;
    animControls.current = animate(0, 1, {
      duration: 1.1,
      ease: "easeInOut",
      onUpdate: (t) => {
        colorBendsRef.current?.setColors(
          fromColors.map((c, i) =>
            lerpHex(c, toColors[i] ?? toColors[toColors.length - 1], t)
          )
        );
      },
    });
  }, []);

  return (
    <AuthProvider>
      <BgContext.Provider value={{ setColorMode }}>
        {/* Persistent background — never unmounts between page navigations */}
        <div className="fixed inset-0 bg-[#fffdf5]" style={{ zIndex: 0 }}>
          <ColorBends
            ref={colorBendsRef}
            colors={ORANGE_COLORS}
            speed={0.25}
            frequency={0.8}
            warpStrength={1.2}
            scale={1}
            intensity={1.8}
            noise={0.12}
            iterations={1}
            bandWidth={1}
            transparent={true}
            mouseInfluence={0}
            parallax={0}
          />
        </div>

        {/* Page content sits on top of the persistent background */}
        <div className="relative h-full" style={{ zIndex: 1 }}>
          {children}
        </div>
      </BgContext.Provider>
    </AuthProvider>
  );
}
