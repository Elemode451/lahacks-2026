"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface BrainMeshProps {
  flashing?: boolean;
  activationLevel?: number;
  fingerprint?: string;
  timePosition?: number;
}

function decodeFingerprint(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

function activationToColor(value: number): [number, number, number] {
  // Map normalized activation (0-1) to a cool-blue → warm-red gradient
  const t = Math.max(0, Math.min(1, value));
  if (t < 0.5) {
    // Blue (0.2, 0.4, 0.8) → White/Neutral (0.85, 0.85, 0.85)
    const s = t * 2;
    return [
      0.2 + s * 0.65,
      0.4 + s * 0.45,
      0.8 + s * 0.05,
    ];
  }
  // White/Neutral → Orange (0.98, 0.35, 0.22) → Red
  const s = (t - 0.5) * 2;
  return [
    0.85 + s * 0.13,
    0.85 - s * 0.5,
    0.85 - s * 0.63,
  ];
}

function useRealBrainGeometry() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const geoRef = useRef<THREE.BufferGeometry | null>(null);

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

        geoRef.current?.dispose();
        geoRef.current = geo;
        setGeometry(geo);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Failed to load brain mesh:", err);
      });
    return () => {
      controller.abort();
      geoRef.current?.dispose();
      geoRef.current = null;
    };
  }, []);

  return geometry;
}

export default function BrainMesh({
  flashing = false,
  activationLevel = 0.5,
  fingerprint,
  timePosition = 0,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const flashStartRef = useRef<number | null>(null);

  const geometry = useRealBrainGeometry();

  // Decode fingerprint and compute vertex colors
  const fingerprintColors = useMemo(() => {
    if (!fingerprint || !geometry) return null;
    try {
      const floats = decodeFingerprint(fingerprint);
      const vertexCount = geometry.getAttribute("position").count;
      const colors = new Float32Array(vertexCount * 3);

      // Normalize: find min/max of fingerprint values
      let min = Infinity;
      let max = -Infinity;
      const len = Math.min(floats.length, vertexCount);
      for (let i = 0; i < len; i++) {
        const v = Math.abs(floats[i]);
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const range = max - min || 1;

      for (let i = 0; i < vertexCount; i++) {
        const raw = i < floats.length ? Math.abs(floats[i]) : 0;
        const normalized = (raw - min) / range;
        const [r, g, b] = activationToColor(normalized);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      return colors;
    } catch {
      return null;
    }
  }, [fingerprint, geometry]);

  // Apply fingerprint colors to geometry
  useEffect(() => {
    if (!geometry || !fingerprintColors) return;
    const colorAttr = geometry.getAttribute("color");
    if (colorAttr instanceof THREE.BufferAttribute) {
      colorAttr.array.set(fingerprintColors);
      colorAttr.needsUpdate = true;
    }
  }, [geometry, fingerprintColors]);

  useEffect(() => {
    if (flashing) {
      flashStartRef.current = performance.now();
    } else if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0;
      flashStartRef.current = null;
    }
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
