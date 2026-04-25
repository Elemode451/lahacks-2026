"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
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
        camera={{ position: [0, 0, 2.8], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.0} />
        <directionalLight position={[-3, 2, -2]} intensity={0.4} />
        <pointLight
          position={[0, -1, 2]}
          intensity={0.3}
          color="#f4d35e"
        />

        <Suspense fallback={null}>
          <BrainMesh
            flashing={flashing}
            activationLevel={activationLevel}
            timePosition={timePosition}
          />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={interactive}
          autoRotate={!interactive}
          autoRotateSpeed={0.5}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.7}
        />
      </Canvas>
    </div>
  );
}
