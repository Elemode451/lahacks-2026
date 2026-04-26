"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import BrainMesh from "./BrainMesh";

interface BrainSceneProps {
  className?: string;
  flashing?: boolean;
  interactive?: boolean;
  activationLevel?: number;
  timePosition?: number;
}

export default function BrainScene({
  className,
  flashing = false,
  interactive = false,
  activationLevel = 0.5,
  timePosition = 0,
}: BrainSceneProps) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 1.5, 4.2], fov: 52, up: [0, 1, 0] }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 6, 5]} intensity={0.85} />
        <directionalLight position={[-4, 2, 5]} intensity={0.5} />
        <directionalLight position={[0, -2, 3]} intensity={0.22} />

        <Suspense fallback={null}>
          <BrainMesh
            flashing={flashing}
            activationLevel={activationLevel}
            timePosition={timePosition}
          />
        </Suspense>

        <OrbitControls
          target={[0, 0, 0]}
          enableZoom={false}
          enablePan={false}
          enableRotate={true}
          autoRotate={!interactive}
          autoRotateSpeed={0.5}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
        />
      </Canvas>
    </div>
  );
}
