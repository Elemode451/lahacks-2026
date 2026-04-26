"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const N_VERTICES = 20484;

interface BrainMeshProps {
  flashing?: boolean;
  activationLevel?: number;
  fingerprint?: Float32Array | null;
  temporalData?: Float32Array | null;
  segmentIndex?: number;
}

/* ── Heatmap color stops (design system) ─────────────────────────── */
// cream (#fffdf5) → gold (#f4d35e) → sandy (#ee964b) → tomato (#f95738)

const STOPS: [number, number, number][] = [
  [1.0, 0.992, 0.96],   // #fffdf5 — cream (low)
  [0.957, 0.827, 0.369], // #f4d35e — gold
  [0.933, 0.588, 0.294], // #ee964b — sandy
  [0.976, 0.341, 0.22],  // #f95738 — tomato (high)
];

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function heatmapColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.33) return lerpColor(STOPS[0], STOPS[1], clamped / 0.33);
  if (clamped <= 0.66) return lerpColor(STOPS[1], STOPS[2], (clamped - 0.33) / 0.33);
  return lerpColor(STOPS[2], STOPS[3], (clamped - 0.66) / 0.34);
}

function computeAbsCeiling(arr: Float32Array, percentile: number): number {
  const abs = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) abs[i] = Math.abs(arr[i]);
  abs.sort();
  return abs[Math.floor(percentile * (abs.length - 1))] || 1;
}

/* ── Geometry loader ─────────────────────────────────────────────── */

interface BrainGeoData {
  geometry: THREE.BufferGeometry;
  baseColors: Float32Array;
}

function useRealBrainGeometry() {
  const [geoData, setGeoData] = useState<BrainGeoData | null>(null);
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
        setGeoData({ geometry: geo, baseColors: Float32Array.from(colors) });
      })
      .catch((err) => {
        if (err.name !== "AbortError")
          console.error("Failed to load brain mesh:", err);
      });
    return () => {
      controller.abort();
      geoRef.current?.dispose();
      geoRef.current = null;
    };
  }, []);

  return geoData;
}

/* ── Component ───────────────────────────────────────────────────── */

export default function BrainMesh({
  flashing = false,
  activationLevel = 0.5,
  fingerprint = null,
  temporalData = null,
  segmentIndex = 0,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const flashStartRef = useRef<number | null>(null);

  const geoData = useRealBrainGeometry();

  // Pick the active fingerprint: temporal segment or global
  const activeFingerprint = useMemo(() => {
    if (temporalData && temporalData.length === 30 * N_VERTICES) {
      const start = segmentIndex * N_VERTICES;
      return temporalData.slice(start, start + N_VERTICES);
    }
    return fingerprint;
  }, [temporalData, segmentIndex, fingerprint]);

  // Compute the 95th-percentile of absolute values as a ceiling
  const absCeiling = useMemo(() => {
    if (!activeFingerprint || activeFingerprint.length !== N_VERTICES) return null;
    return computeAbsCeiling(activeFingerprint, 0.95);
  }, [activeFingerprint]);

  // Apply heatmap colors to vertex color attribute
  useEffect(() => {
    if (!geoData) return;
    const colorAttr = geoData.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!colorAttr) return;

    if (!activeFingerprint || activeFingerprint.length !== N_VERTICES || !absCeiling) {
      // No fingerprint data — restore base colors
      colorAttr.array.set(geoData.baseColors);
      colorAttr.needsUpdate = true;
      return;
    }

    const ceil = absCeiling;
    const arr = colorAttr.array as Float32Array;
    const base = geoData.baseColors;

    for (let v = 0; v < N_VERTICES; v++) {
      // Map absolute activation to 0–1, apply power curve so low stays cream
      const t01 = Math.min(1, Math.abs(activeFingerprint[v]) / ceil);
      const shaped = Math.pow(t01, 2.5);

      if (shaped < 0.05) {
        // Below threshold: keep original base color (beige/cream)
        arr[v * 3] = base[v * 3];
        arr[v * 3 + 1] = base[v * 3 + 1];
        arr[v * 3 + 2] = base[v * 3 + 2];
      } else {
        const [r, g, b] = heatmapColor(shaped);
        arr[v * 3] = r;
        arr[v * 3 + 1] = g;
        arr[v * 3 + 2] = b;
      }
    }

    colorAttr.needsUpdate = true;
  }, [geoData, activeFingerprint, absCeiling]);

  // Flash animation
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

  if (!geoData) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geoData.geometry}
      scale={[1.4, 1.4, 1.4]}
      rotation={[0.0, 0.0, 0.0]}
    >
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
