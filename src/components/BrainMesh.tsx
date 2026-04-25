"use client";

import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { fbm } from "@/lib/noise";

interface BrainMeshProps {
  flashing?: boolean;
  activationLevel?: number;
  timePosition?: number;
}

function createBrainGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 6);
  const positions = geo.attributes.position;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    const len = Math.sqrt(x * x + y * y + z * z);
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;

    // Anatomical brain shaping
    const bx = nx * 0.82;
    const by = ny * 1.0;
    const bz = nz * 1.08;

    const theta = Math.atan2(bz, bx);
    const phi = Math.asin(Math.max(-1, Math.min(1, by)));

    // Longitudinal fissure (midline groove)
    const fissureDepth = Math.exp(-bx * bx * 120) * 0.18;

    // Temporal lobe bulge (sides, below)
    const temporalBulge =
      Math.exp(-Math.pow(phi + 0.35, 2) * 6) *
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI * 0.35, 2) * 3) *
      0.12;

    // Frontal lobe bulge (front-top)
    const frontalBulge =
      Math.exp(-Math.pow(theta, 2) * 1.5) *
      Math.exp(-Math.pow(phi - 0.25, 2) * 3) *
      0.1;

    // Occipital bulge (back)
    const occipitalBulge =
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI, 2) * 2) *
      Math.exp(-Math.pow(phi + 0.1, 2) * 3) *
      0.08;

    // Parietal dome (top)
    const parietalBulge =
      Math.exp(-Math.pow(phi - 0.6, 2) * 4) * 0.06;

    // Cerebellum (lower back)
    const cerebellumBulge =
      Math.exp(-Math.pow(phi + 0.7, 2) * 8) *
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI * 0.7, 2) * 4) *
      0.1;

    // Primary gyri (large folds) — low frequency, high amplitude
    const gyri1 = fbm(bx * 3.5, by * 3.5, bz * 3.5, 3, 2.1, 0.55) * 0.09;

    // Secondary sulci (medium folds)
    const sulci1 = fbm(bx * 7, by * 7, bz * 7, 4, 2.0, 0.5) * 0.045;

    // Tertiary detail (fine wrinkles)
    const wrinkle1 = fbm(bx * 14, by * 14, bz * 14, 3, 2.0, 0.45) * 0.018;

    // Very fine detail
    const wrinkle2 = fbm(bx * 28, by * 28, bz * 28, 2, 2.0, 0.4) * 0.008;

    // Sylvian fissure (lateral sulcus)
    const sylvianFissure =
      Math.exp(-Math.pow(phi + 0.1, 2) * 25) *
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI * 0.4, 2) * 8) *
      -0.06;

    // Central sulcus (Rolandic fissure)
    const centralSulcus =
      Math.exp(-Math.pow(theta - Math.PI * 0.15, 2) * 30) *
      Math.exp(-Math.pow(phi - 0.3, 2) * 3) *
      -0.04;

    // Bottom flattening (brain stem area)
    const bottomFlat = Math.max(0, -phi - 0.6) * 0.3;

    const r =
      0.82 +
      temporalBulge +
      frontalBulge +
      occipitalBulge +
      parietalBulge +
      cerebellumBulge +
      gyri1 +
      sulci1 +
      wrinkle1 +
      wrinkle2 +
      sylvianFissure +
      centralSulcus -
      fissureDepth * 0.6 -
      bottomFlat;

    positions.setXYZ(i, bx * r * 1.18, by * r * 0.98, bz * r * 1.12);

    // Coloring: white/light gray base with heatmap overlay
    const sulcusShading = Math.max(0, Math.min(1,
      0.88 + gyri1 * 2.5 + sulci1 * 1.5 + wrinkle1 * 1.0
    ));

    // Regional activation heatmap
    const limbicHeat =
      Math.exp(-Math.pow(phi + 0.2, 2) * 5) *
      Math.exp(-Math.pow(theta - Math.PI * 0.4, 2) * 3);

    const prefrontalHeat =
      Math.exp(-Math.pow(theta + 0.15, 2) * 2.5) *
      Math.exp(-Math.pow(phi - 0.2, 2) * 4);

    const auditoryHeat =
      Math.exp(-Math.pow(phi + 0.35, 2) * 8) *
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI * 0.45, 2) * 4);

    const motorHeat =
      Math.exp(-Math.pow(theta - Math.PI * 0.12, 2) * 12) *
      Math.exp(-Math.pow(phi - 0.4, 2) * 4);

    const occipitalHeat =
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI, 2) * 3) *
      Math.exp(-Math.pow(phi, 2) * 5);

    const heat = Math.min(1, Math.max(
      limbicHeat * 0.9,
      prefrontalHeat * 0.65,
      auditoryHeat * 1.0,
      motorHeat * 0.5,
      occipitalHeat * 0.4
    ) * 1.6);

    // Heatmap colors: from white/gray → yellow → orange → red
    const hotR = 249 / 255;
    const hotG = 70 / 255;
    const hotB = 40 / 255;
    const midR = 245 / 255;
    const midG = 140 / 255;
    const midB = 50 / 255;
    const lowR = 250 / 255;
    const lowG = 210 / 255;
    const lowB = 70 / 255;

    let cr: number, cg: number, cb: number;
    if (heat > 0.55) {
      const t = (heat - 0.55) / 0.45;
      cr = midR + (hotR - midR) * t;
      cg = midG + (hotG - midG) * t;
      cb = midB + (hotB - midB) * t;
    } else if (heat > 0.2) {
      const t = (heat - 0.2) / 0.35;
      cr = lowR + (midR - lowR) * t;
      cg = lowG + (midG - lowG) * t;
      cb = lowB + (midB - lowB) * t;
    } else if (heat > 0.08) {
      const t = (heat - 0.08) / 0.12;
      cr = sulcusShading + (lowR - sulcusShading) * t;
      cg = sulcusShading + (lowG - sulcusShading) * t;
      cb = sulcusShading + (lowB - sulcusShading) * t;
    } else {
      cr = sulcusShading;
      cg = sulcusShading;
      cb = sulcusShading;
    }

    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export default function BrainMesh({
  flashing = false,
  activationLevel = 0.5,
  timePosition = 0,
}: BrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const geometry = useMemo(() => createBrainGeometry(), []);

  const flashStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (flashing) {
      flashStartRef.current = performance.now();
    }
  }, [flashing]);

  useFrame((state) => {
    if (!meshRef.current) return;

    meshRef.current.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.12) * 0.1 +
      timePosition * Math.PI * 2;

    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.02;

    if (flashing && flashStartRef.current !== null && materialRef.current) {
      const elapsed = (performance.now() - flashStartRef.current) / 1000;
      const flashCycle = elapsed * 5;
      const pulse = Math.pow(Math.sin(flashCycle * Math.PI) * 0.5 + 0.5, 3);
      if (elapsed < 0.8) {
        materialRef.current.emissiveIntensity = pulse * 2.5 * activationLevel;
      } else {
        materialRef.current.emissiveIntensity = 0;
        flashStartRef.current = null;
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[0.05, -0.5, 0.02]}>
      <meshStandardMaterial
        ref={materialRef}
        vertexColors
        roughness={0.45}
        metalness={0.02}
        emissive={new THREE.Color("#f95738")}
        emissiveIntensity={0}
      />
    </mesh>
  );
}
