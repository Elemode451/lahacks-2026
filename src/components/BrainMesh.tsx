"use client";

import { useRef, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface BrainMeshProps {
  flashing?: boolean;
  activationLevel?: number;
  timePosition?: number;
}

function useRealBrainGeometry() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/brain_mesh.json", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const geo = new THREE.BufferGeometry();

        const positions = new Float32Array(data.positions);
        const colors = new Float32Array(data.colors.flat());
        const indices = new Uint32Array(data.indices);

        geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.computeVertexNormals();

        setGeometry(geo);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Failed to load brain mesh:", err);
      });
    return () => controller.abort();
  }, []);

  return geometry;
}

export default function BrainMesh({
  flashing = false,
  activationLevel = 0.5,
  timePosition = 0,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const flashStartRef = useRef<number | null>(null);

  const geometry = useRealBrainGeometry();

  useEffect(() => {
    if (flashing) flashStartRef.current = performance.now();
  }, [flashing]);

  useFrame(() => {
    if (!meshRef.current) return;

    if (flashing && flashStartRef.current !== null && materialRef.current) {
      const elapsed = (performance.now() - flashStartRef.current) / 1000;
      const pulse = Math.pow(Math.sin(elapsed * 5 * Math.PI) * 0.5 + 0.5, 3);
      materialRef.current.emissiveIntensity =
        elapsed < 0.8 ? pulse * 2.5 * activationLevel : 0;
      if (elapsed >= 0.8) flashStartRef.current = null;
    }
  });

  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry} scale={[1.4, 1.4, 1.4]} rotation={[0.0, 0.0, 0.0]}>
      <meshStandardMaterial
        ref={materialRef}
        vertexColors
        roughness={0.55}
        metalness={0.0}
        emissive={new THREE.Color("#f95738")}
        emissiveIntensity={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
