"use client";

import { motion } from "framer-motion";

interface RadarChartProps {
  data?: number[];
  labels?: string[];
}

const DEFAULT_LABELS = ["Danceability", "Energy", "Valence", "Acousticness", "Instrumentalness", "Tempo", "Speechiness"];
const DEFAULT_DATA = [0.78, 0.52, 0.65, 0.42, 0.88, 0.61, 0.34];

export default function RadarChart({
  data = DEFAULT_DATA,
  labels = DEFAULT_LABELS,
}: RadarChartProps) {
  const cx = 180;
  const cy = 170;
  const maxR = 120;
  const levels = 5;
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
      <svg viewBox="0 0 360 360" className="w-full">
        {/* Axis lines */}
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
              strokeOpacity={0.1}
              strokeWidth={1}
            />
          );
        })}

        {/* Grid polygons */}
        {gridPaths.map((d, i) => (
          <path
            key={`grid-${i}`}
            d={d}
            fill="none"
            stroke="#0d3b66"
            strokeOpacity={0.06 + i * 0.025}
            strokeWidth={1}
          />
        ))}

        {/* Data fill */}
        <motion.path
          d={dataPath}
          fill="rgba(249, 87, 56, 0.1)"
          stroke="#f95738"
          strokeWidth={2}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />

        {/* Data points */}
        {data.map((v, i) => {
          const p = getPoint(i, v * maxR);
          return (
            <motion.circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#f95738"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.55 + i * 0.07 }}
            />
          );
        })}

        {/* Labels */}
        {labels.map((label, i) => {
          const p = getPoint(i, maxR + 22);
          const angle = startAngle + i * angleStep;
          const textAnchor =
            Math.abs(Math.cos(angle)) < 0.15
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
              fontSize={10}
              fill="#0d3b66"
              fillOpacity={0.45}
              fontFamily="Switzer, sans-serif"
              letterSpacing="-0.3"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
