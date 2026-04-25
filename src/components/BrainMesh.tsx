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
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const positions = geo.attributes.position;
  const colors = new Float32Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i);
    let y = positions.getY(i);
    let z = positions.getZ(i);

    const len = Math.sqrt(x * x + y * y + z * z);
    x /= len;
    y /= len;
    z /= len;

    const sx = x * 0.85;
    let sy = y * 0.95;
    const sz = z * 1.05;

    const fissureDepth = Math.exp(-sx * sx * 80) * 0.12;
    sy -= fissureDepth;

    const theta = Math.atan2(sz, sx);
    const phi = Math.asin(Math.max(-1, Math.min(1, sy)));

    const temporalBulge =
      Math.exp(-Math.pow(phi + 0.3, 2) * 8) *
      Math.exp(-Math.pow(theta - Math.PI * 0.3, 2) * 3) *
      0.08;

    const frontalBulge =
      Math.exp(-Math.pow(theta, 2) * 2) *
      Math.exp(-Math.pow(phi - 0.2, 2) * 4) *
      0.06;

    const occipitalBulge =
      Math.exp(-Math.pow(theta - Math.PI, 2) * 3) *
      Math.exp(-Math.pow(phi, 2) * 4) *
      0.05;

    const wrinkle1 = fbm(sx * 4, sy * 4, sz * 4, 4, 2.2, 0.5) * 0.06;
    const wrinkle2 = fbm(sx * 8, sy * 8, sz * 8, 3, 2.0, 0.45) * 0.025;
    const wrinkle3 = fbm(sx * 16, sy * 16, sz * 16, 2, 2.0, 0.4) * 0.01;

    const r =
      0.85 +
      temporalBulge +
      frontalBulge +
      occipitalBulge +
      wrinkle1 +
      wrinkle2 +
      wrinkle3 -
      fissureDepth * 0.5;

    positions.setXYZ(i, sx * r * 1.15, sy * r * 1.0, sz * r * 1.1);

    const baseGray = 0.82 + wrinkle1 * 1.5;

    const limbicHeat =
      Math.exp(-Math.pow(phi + 0.2, 2) * 6) *
      Math.exp(-Math.pow(theta - Math.PI * 0.4, 2) * 4);

    const prefrontalHeat =
      Math.exp(-Math.pow(theta + 0.2, 2) * 3) *
      Math.exp(-Math.pow(phi - 0.3, 2) * 5);

    const auditoryCool =
      Math.exp(-Math.pow(phi + 0.4, 2) * 10) *
      Math.exp(-Math.pow(Math.abs(theta) - Math.PI * 0.5, 2) * 5);

    const heat = Math.max(limbicHeat, prefrontalHeat * 0.7, auditoryCool * 0.5);

    const hotR = 249 / 255;
    const hotG = 87 / 255;
    const hotB = 56 / 255;
    const midR = 238 / 255;
    const midG = 150 / 255;
    const midB = 75 / 255;
    const lowR = 244 / 255;
    const lowG = 211 / 255;
    const lowB = 94 / 255;

    let cr: number, cg: number, cb: number;
    if (heat > 0.5) {
      const t = (heat - 0.5) * 2;
      cr = midR + (hotR - midR) * t;
      cg = midG + (hotG - midG) * t;
      cb = midB + (hotB - midB) * t;
    } else if (heat > 0.15) {
      const t = (heat - 0.15) / 0.35;
      cr = lowR + (midR - lowR) * t;
      cg = lowG + (midG - lowG) * t;
      cb = lowB + (midB - lowB) * t;
    } else {
      const t = heat / 0.15;
      cr = baseGray + (lowR - baseGray) * t;
      cg = baseGray + (lowG - baseGray) * t;
      cb = baseGray + (lowB - baseGray) * t;
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
      Math.sin(state.clock.elapsedTime * 0.15) * 0.12 +
      timePosition * Math.PI * 2;

    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.03;

    if (flashing && flashStartRef.current !== null && materialRef.current) {
      const elapsed = (performance.now() - flashStartRef.current) / 1000;
      const flashCycle = elapsed * 5;
      const pulse = Math.pow(Math.sin(flashCycle * Math.PI) * 0.5 + 0.5, 3);
      if (elapsed < 0.8) {
        materialRef.current.emissiveIntensity = pulse * 2 * activationLevel;
      } else {
        materialRef.current.emissiveIntensity = 0;
        flashStartRef.current = null;
      }
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[0, -0.3, 0.05]}>
      <meshStandardMaterial
        ref={materialRef}
        vertexColors
        roughness={0.55}
        metalness={0.05}
        emissive={new THREE.Color("#f95738")}
        emissiveIntensity={0}
      />
    </mesh>
  );
}
