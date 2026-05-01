"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const N_VERTICES = 20484;
const IDLE_HOTSPOT_COUNT = 7;
const IDLE_MIN_CENTER_DISTANCE = 0.34;
const IDLE_FRAME_SKIP = 2;

interface BrainMeshProps {
  flashing?: boolean;
  autoRotate?: boolean;
  activationLevel?: number;
  fingerprint?: Float32Array | null;
  temporalData?: Float32Array | null;
  segmentIndex?: number;
}

/* ── Heatmap color stops (design system) ─────────────────────────── */
// cream (#fffdf5) → gold (#f4d35e) → sandy (#ee964b) → tomato (#f95738)

const STOPS: [number, number, number][] = [
  [1.0, 0.992, 0.96],    // #fffdf5 — cream (none)
  [0.957, 0.827, 0.369], // #f4d35e — gold (low)
  [0.933, 0.588, 0.294], // #ee964b — sandy (mid)
  [0.976, 0.341, 0.22],  // #f95738 — tomato (peak)
];

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function heatmapColor(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  if (c <= 0.33) return lerpColor(STOPS[0], STOPS[1], c / 0.33);
  if (c <= 0.66) return lerpColor(STOPS[1], STOPS[2], (c - 0.33) / 0.33);
  return lerpColor(STOPS[2], STOPS[3], (c - 0.66) / 0.34);
}

function computeAbsCeiling(arr: Float32Array, percentile: number): number {
  const abs = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) abs[i] = Math.abs(arr[i]);
  abs.sort();
  return abs[Math.floor(percentile * (abs.length - 1))] || 1;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

/* ── Fast 3D value noise (xorshift hash + trilinear interp) ─────── */

function ihash(n: number): number {
  n = n | 0;
  n ^= n << 13;
  n ^= n >> 17;
  n ^= n << 5;
  return (n & 0x7fffffff) / 0x7fffffff;
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x) | 0;
  const iy = Math.floor(y) | 0;
  const iz = Math.floor(z) | 0;
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  // Smoothstep
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const h = (dx: number, dy: number, dz: number) =>
    ihash(ix + dx + (iy + dy) * 127 + (iz + dz) * 16381);
  const m = (a: number, b: number, t: number) => a + (b - a) * t;

  return m(
    m(m(h(0,0,0), h(1,0,0), ux), m(h(0,1,0), h(1,1,0), ux), uy),
    m(m(h(0,0,1), h(1,0,1), ux), m(h(0,1,1), h(1,1,1), ux), uy),
    uz,
  );
}

/* ── Idle cortical-region hotspot animation ─────────────────────── */

interface BrainHotspot {
  x: number;
  y: number;
  z: number;
  radius: number;
  haloRadius: number;
  strength: number;
  noiseScale: number;
  phase: number;
}

interface IdleHotspotState {
  from: BrainHotspot[];
  to: BrainHotspot[];
  startedAt: number;
  duration: number;
  nextAt: number;
  staticPainted: boolean;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function createIdleHotspots(positions: Float32Array): BrainHotspot[] {
  const hotspots: BrainHotspot[] = [];
  const minDistanceSq = IDLE_MIN_CENTER_DISTANCE * IDLE_MIN_CENTER_DISTANCE;
  let attempts = 0;

  while (hotspots.length < IDLE_HOTSPOT_COUNT && attempts < 240) {
    attempts++;
    const vertex = Math.floor(Math.random() * N_VERTICES);
    const i = vertex * 3;
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    const tooClose = hotspots.some((hotspot) => {
      const dx = x - hotspot.x;
      const dy = y - hotspot.y;
      const dz = z - hotspot.z;
      return dx * dx + dy * dy + dz * dz < minDistanceSq;
    });
    if (tooClose) continue;

    hotspots.push({
      x,
      y,
      z,
      radius: randomRange(0.14, 0.23),
      haloRadius: randomRange(0.38, 0.58),
      strength: randomRange(0.78, 1.12),
      noiseScale: randomRange(4.2, 6.8),
      phase: randomRange(0, Math.PI * 2),
    });
  }

  return hotspots;
}

function evaluateIdleHotspots(
  x: number,
  y: number,
  z: number,
  hotspots: BrainHotspot[],
  t: number,
): number {
  let activation = 0;

  for (const hotspot of hotspots) {
    const pulse = 1 + Math.sin(t * 1.4 + hotspot.phase) * 0.045;
    const radius = hotspot.radius * pulse;
    const radiusSq = radius * radius;
    const haloRadius = hotspot.haloRadius * (1 + Math.sin(t * 0.55 + hotspot.phase) * 0.035);
    const haloRadiusSq = haloRadius * haloRadius;
    const dx = x - hotspot.x;
    const dy = y - hotspot.y;
    const dz = z - hotspot.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;

    if (distanceSq < haloRadiusSq) {
      const haloFalloff = smoothstep(1 - distanceSq / haloRadiusSq);
      const blobNoise = noise3(
        x * hotspot.noiseScale + hotspot.phase + t * 0.06,
        y * hotspot.noiseScale - hotspot.phase * 0.7 - t * 0.045,
        z * hotspot.noiseScale + 19.7 + t * 0.035,
      );
      const blobbyMask = smoothstep((blobNoise - 0.22) / 0.58);
      activation += haloFalloff * (0.12 + blobbyMask * 0.42) * hotspot.strength;
    }

    if (distanceSq < radiusSq) {
      const coreFalloff = smoothstep(1 - distanceSq / radiusSq);
      const lobe = coreFalloff * coreFalloff;
      activation += lobe * hotspot.strength;
    }
  }

  if (activation <= 0) return 0;

  const mottling = 0.82 + noise3(x * 9.5 + t * 0.42, y * 9.5 - t * 0.31, z * 9.5 + 37.3) * 0.3;
  return Math.min(1, activation * mottling);
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
        if (err.name !== "AbortError") console.error("Failed to load brain mesh:", err);
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
  autoRotate = true,
  activationLevel = 0.5,
  fingerprint = null,
  temporalData = null,
  segmentIndex = 0,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const flashStartRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const spinSpeedRef = useRef(0);
  const idleHotspotsRef = useRef<IdleHotspotState | null>(null);
  // Ref so useFrame always sees the latest fingerprint without re-registering
  const activeFingerprintRef = useRef<Float32Array | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const geoData = useRealBrainGeometry();

  const activeFingerprint = useMemo(() => {
    if (temporalData && temporalData.length === 30 * N_VERTICES) {
      const start = segmentIndex * N_VERTICES;
      return temporalData.slice(start, start + N_VERTICES);
    }
    return fingerprint;
  }, [temporalData, segmentIndex, fingerprint]);

  useEffect(() => {
    activeFingerprintRef.current = activeFingerprint;
    if (!activeFingerprint && idleHotspotsRef.current) {
      idleHotspotsRef.current = {
        ...idleHotspotsRef.current,
        staticPainted: false,
      };
    }
  }, [activeFingerprint]);

  useEffect(() => {
    if (!geoData) return;
    const posAttr = geoData.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (!posAttr) return;

    const positions = posAttr.array as Float32Array;
    const hotspots = createIdleHotspots(positions);
    idleHotspotsRef.current = {
      from: hotspots,
      to: hotspots,
      startedAt: timeRef.current,
      duration: 1.8,
      nextAt: prefersReducedMotion ? Number.POSITIVE_INFINITY : timeRef.current + randomRange(2.6, 3.8),
      staticPainted: false,
    };
  }, [geoData, prefersReducedMotion]);

  const absCeiling = useMemo(() => {
    if (!activeFingerprint || activeFingerprint.length !== N_VERTICES) return null;
    return computeAbsCeiling(activeFingerprint, 0.95);
  }, [activeFingerprint]);

  // Apply heatmap when analysis fingerprint is present; cream fill otherwise
  useEffect(() => {
    if (!geoData) return;
    const colorAttr = geoData.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!colorAttr) return;

    if (!activeFingerprint || activeFingerprint.length !== N_VERTICES || !absCeiling) {
      // Seed with cream so there's no red flash before useFrame's first noise paint
      const arr = colorAttr.array as Float32Array;
      const [cr, cg, cb] = STOPS[0];
      for (let v = 0; v < N_VERTICES; v++) {
        arr[v * 3] = cr; arr[v * 3 + 1] = cg; arr[v * 3 + 2] = cb;
      }
      colorAttr.needsUpdate = true;
      return;
    }

    const ceil = absCeiling;
    const arr = colorAttr.array as Float32Array;
    const base = geoData.baseColors;

    for (let v = 0; v < N_VERTICES; v++) {
      const t01 = Math.min(1, Math.abs(activeFingerprint[v]) / ceil);
      const shaped = Math.pow(t01, 2.5);
      if (shaped < 0.05) {
        arr[v * 3] = base[v * 3]; arr[v * 3 + 1] = base[v * 3 + 1]; arr[v * 3 + 2] = base[v * 3 + 2];
      } else {
        const [r, g, b] = heatmapColor(shaped);
        arr[v * 3] = r; arr[v * 3 + 1] = g; arr[v * 3 + 2] = b;
      }
    }
    colorAttr.needsUpdate = true;
  }, [geoData, activeFingerprint, absCeiling]);

  useEffect(() => {
    if (flashing) {
      flashStartRef.current = performance.now();
    } else if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0;
      flashStartRef.current = null;
    }
  }, [flashing]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const targetSpinSpeed = autoRotate && !prefersReducedMotion ? 0.18 : 0;
    spinSpeedRef.current = THREE.MathUtils.damp(spinSpeedRef.current, targetSpinSpeed, 5, delta);
    meshRef.current.rotation.y += spinSpeedRef.current * delta;

    // Flash pulse
    if (flashing && flashStartRef.current !== null && materialRef.current) {
      const elapsed = (performance.now() - flashStartRef.current) / 1000;
      const pulse = Math.pow(Math.sin(elapsed * 5 * Math.PI) * 0.5 + 0.5, 3);
      materialRef.current.emissiveIntensity =
        elapsed < 0.8 ? pulse * 2.5 * activationLevel : 0;
      if (elapsed >= 0.8) flashStartRef.current = null;
    }

    // Idle cortical-region animation — skip when real fingerprint is active
    if (!geoData || activeFingerprintRef.current) return;

    timeRef.current += delta;
    frameRef.current++;
    if (frameRef.current % IDLE_FRAME_SKIP !== 0) return; // 30fps effective, keeps frame budget safe

    const t = timeRef.current;
    const colorAttr = geoData.geometry.getAttribute("color") as THREE.BufferAttribute;
    const posAttr = geoData.geometry.getAttribute("position") as THREE.BufferAttribute;
    if (!colorAttr || !posAttr) return;

    const arr = colorAttr.array as Float32Array;
    const pos = posAttr.array as Float32Array;
    let idleHotspots = idleHotspotsRef.current;

    if (!idleHotspots) {
      const hotspots = createIdleHotspots(pos);
      idleHotspots = {
        from: hotspots,
        to: hotspots,
        startedAt: t,
        duration: 1.8,
        nextAt: prefersReducedMotion ? Number.POSITIVE_INFINITY : t + randomRange(2.6, 3.8),
        staticPainted: false,
      };
      idleHotspotsRef.current = idleHotspots;
    }

    if (prefersReducedMotion && idleHotspots.staticPainted) return;

    if (!prefersReducedMotion && t >= idleHotspots.nextAt) {
      const duration = randomRange(1.8, 2.45);
      idleHotspots = {
        from: idleHotspots.to,
        to: createIdleHotspots(pos),
        startedAt: t,
        duration,
        nextAt: t + duration + randomRange(1.25, 2.1),
        staticPainted: false,
      };
      idleHotspotsRef.current = idleHotspots;
    }

    const fade = smoothstep((t - idleHotspots.startedAt) / idleHotspots.duration);

    for (let v = 0; v < N_VERTICES; v++) {
      const px = pos[v * 3];
      const py = pos[v * 3 + 1];
      const pz = pos[v * 3 + 2];

      const previous = evaluateIdleHotspots(px, py, pz, idleHotspots.from, t) * (1 - fade);
      const next = evaluateIdleHotspots(px, py, pz, idleHotspots.to, t) * fade;
      const activation = Math.min(1, previous + next);

      if (activation < 0.003) {
        arr[v * 3] = STOPS[0][0]; arr[v * 3 + 1] = STOPS[0][1]; arr[v * 3 + 2] = STOPS[0][2];
      } else {
        const shaped = Math.min(1, 0.1 + Math.pow(activation, 0.62) * 0.96);
        const [r, g, b] = heatmapColor(shaped);
        arr[v * 3] = r; arr[v * 3 + 1] = g; arr[v * 3 + 2] = b;
      }
    }

    colorAttr.needsUpdate = true;
    if (prefersReducedMotion) {
      idleHotspotsRef.current = {
        ...idleHotspots,
        staticPainted: true,
      };
    }
  });

  if (!geoData) return null;

  return (
    <mesh ref={meshRef} geometry={geoData.geometry} scale={[1.4, 1.4, 1.4]} rotation={[0.0, 0.0, 0.0]}>
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
