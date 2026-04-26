"use client";

import React from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

export interface RadarDataPoint {
  attribute: string;
  value: number; // 0–100
}

interface MusicRadarChartProps {
  data?: RadarDataPoint[];
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

const defaultData: RadarDataPoint[] = [
  { attribute: "danceability", value: 78 },
  { attribute: "energy",       value: 62 },
  { attribute: "valence",      value: 71 },
  { attribute: "tempo",        value: 55 },
  { attribute: "acousticness", value: 43 },
  { attribute: "speechiness",  value: 28 },
];

const REGION_MOOD_MAP: Record<string, string> = {
  "Auditory": "groove · chills",
  "Sup. Temporal": "nostalgia · melody",
  "Temp.-Parietal": "awe · immersion",
  "Inf. Frontal": "tension · surprise",
  "Multisensory": "euphoria · synesthesia",
};

export default function MusicRadarChart({
  data = defaultData,
  color = "#f95738",
  fillOpacity = 0.22,
  strokeWidth = 2,
  className,
  style,
}: MusicRadarChartProps) {
  return (
    <div className={`[&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none ${className ?? ""}`} style={style}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 20, right: 50, bottom: 20, left: 50 }}>
          <PolarGrid gridType="polygon" stroke="rgba(13,59,102,0.12)" />
          <PolarAngleAxis
            dataKey="attribute"
            tick={(props: { x: string | number; y: string | number; payload: { value: string }; textAnchor: string }) => {
              const label = props.payload.value;
              const mood = REGION_MOOD_MAP[label];
              const anchor = props.textAnchor as "inherit" | "end" | "start" | "middle";
              const nx = Number(props.x);
              const ny = Number(props.y);
              return (
                <g>
                  <text
                    x={nx}
                    y={ny}
                    textAnchor={anchor}
                    fill="rgba(13,59,102,0.5)"
                    fontSize={9}
                    fontWeight={600}
                    letterSpacing="0.09em"
                    dominantBaseline="middle"
                  >
                    {label.toUpperCase()}
                  </text>
                  {mood && (
                    <text
                      x={nx}
                      y={ny + 11}
                      textAnchor={anchor}
                      fill="rgba(249,87,56,0.45)"
                      fontSize={7.5}
                      fontWeight={500}
                      letterSpacing="0.04em"
                      dominantBaseline="middle"
                    >
                      {mood}
                    </text>
                  )}
                </g>
              );
            }}
          />
          <Radar
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={fillOpacity}
            strokeWidth={strokeWidth}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
