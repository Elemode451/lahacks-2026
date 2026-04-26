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
        <RadarChart data={data} margin={{ top: 16, right: 40, bottom: 16, left: 40 }}>
          <PolarGrid gridType="polygon" stroke="rgba(13,59,102,0.12)" />
          <PolarAngleAxis
            dataKey="attribute"
            tick={(props: { x: number; y: number; payload: { value: string }; textAnchor: string }) => (
              <text
                x={props.x}
                y={props.y}
                textAnchor={props.textAnchor}
                fill="rgba(13,59,102,0.5)"
                fontSize={9}
                fontWeight={600}
                letterSpacing="0.09em"
                dominantBaseline="middle"
              >
                {props.payload.value.toUpperCase()}
              </text>
            )}
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
