"use client";

import { motion } from "framer-motion";

interface RadarChartProps {
  data?: number[];
  labels?: string[];
}

const DEFAULT_LABELS = ["Limbic", "Motor", "Auditory", "Prefrontal", "Default Mode"];
const DEFAULT_DATA = [0.75, 0.45, 0.85, 0.6, 0.55];

export default function RadarChart({
  data = DEFAULT_DATA,
  labels = DEFAULT_LABELS,
}: RadarChartProps) {
  const cx = 150;
  const cy = 140;
  const maxR = 100;
  const levels = 4;
  const n = labels.length;

  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  };

  const gridPaths = Array.from({ length: levels }, (_, level) => {
    const r = ((level + 1) / levels) * maxR;
    const points = Array.from({ length: n }, (_, i) => {
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    }).join(" ");
    return `M ${points} Z`;
  });

  const dataPoints = data.map((v, i) => {
    const p = getPoint(i, v * maxR);
    return `${p.x},${p.y}`;
  });

  const dataPath = `M ${dataPoints.join(" ")} Z`;

  return (
    <div className="w-full">
      <h3 className="font-display text-navy text-lg font-semibold tracking-tight mb-3">
        Regional Activation
      </h3>
      <svg viewBox="0 0 300 300" className="w-full max-w-[280px] mx-auto">
        {Array.from({ length: n }, (_, i) => {
          const p = getPoint(i, maxR);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke="#0d3b66"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

        {gridPaths.map((d, i) => (
          <path
            key={`grid-${i}`}
            d={d}
            fill="none"
            stroke="#0d3b66"
            strokeOpacity={0.06 + i * 0.02}
            strokeWidth={1}
          />
        ))}

        <motion.path
          d={dataPath}
          fill="rgba(249, 87, 56, 0.12)"
          stroke="#f95738"
          strokeWidth={2}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {data.map((v, i) => {
          const p = getPoint(i, v * maxR);
          return (
            <motion.circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="#f95738"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.5 + i * 0.08 }}
            />
          );
        })}

        {labels.map((label, i) => {
          const p = getPoint(i, maxR + 20);
          const angle = startAngle + i * angleStep;
          const textAnchor =
            Math.abs(Math.cos(angle)) < 0.1
              ? "middle"
              : Math.cos(angle) > 0
              ? "start"
              : "end";

          return (
            <text
              key={`label-${i}`}
              x={p.x}
              y={p.y}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="font-body text-navy"
              fontSize={10}
              fill="#0d3b66"
              fillOpacity={0.5}
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
