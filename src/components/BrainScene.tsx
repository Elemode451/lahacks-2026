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
        camera={{ position: [0, 0.15, 2.8], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.2} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <directionalLight position={[0, -3, 2]} intensity={0.2} />
        <pointLight position={[2, 0, 3]} intensity={0.4} color="#fff8f0" />
        <pointLight position={[-2, -1, 2]} intensity={0.15} color="#f4d35e" />

        <Suspense fallback={null}>
          <BrainMesh
            flashing={flashing}
            activationLevel={activationLevel}
            timePosition={timePosition}
          />
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={interactive}
          autoRotate={!interactive}
          autoRotateSpeed={0.4}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.7}
        />
      </Canvas>
    </div>
  );
}
