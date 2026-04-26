"use client";

import { SVGProps } from "react";
import typicalPaths from "@/lib/svg-paths/typical";
import importingPaths from "@/lib/svg-paths/importing";
import introPaths from "@/lib/svg-paths/intro";

export function SeratuneLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 242.147 40.576" {...props}>
      <g id="seratune">
        <path d={typicalPaths.p3d452600} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.p2afa2800} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.p35e7fdf0} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.pa3ccd00} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.p27c4ff00} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.p1b04ee00} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.p8179a80} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.p32890580} fill="var(--fill-0, #0D3B66)" />
        <path d="M0 15.936H3V30.436H0V15.936Z" fill="var(--fill-0, #0D3B66)" />
      </g>
    </svg>
  );
}

export function SpiderChartSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 408 408" {...props}>
      <g id="spider chart">
        <path d={typicalPaths.p727db00} fill="var(--fill-0, #0D3B66)" />
        <path d={typicalPaths.pf291900} stroke="var(--stroke-0, #F95738)" strokeWidth="4" />
      </g>
    </svg>
  );
}

export function SoundBarsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 24 24" {...props}>
      <path d={introPaths.p2695300} fill="var(--fill-0, #F95738)" />
      <path d={introPaths.p2bc68480} fill="var(--fill-0, #F95738)" />
      <path d={introPaths.pe345a00} fill="var(--fill-0, #F95738)" />
      <path d={introPaths.p174e5480} fill="var(--fill-0, #F95738)" />
      <path d={introPaths.p30afc200} fill="var(--fill-0, #F95738)" />
    </svg>
  );
}

export function FileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 39.5833 45.8333" {...props}>
      <path d={importingPaths.p545e680} fill="currentColor" />
    </svg>
  );
}

export function SpotifyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 45 45" {...props}>
      <path d={importingPaths.p38d3dc80} fill="currentColor" />
    </svg>
  );
}

export function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 50.9992 35.7168" {...props}>
      <path d={importingPaths.pd2d7600} fill="currentColor" />
    </svg>
  );
}

export function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" preserveAspectRatio="none" viewBox="0 0 50 50" {...props}>
      <path d={importingPaths.p36328c00} fill="currentColor" />
    </svg>
  );
}
