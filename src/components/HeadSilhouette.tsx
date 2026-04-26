"use client";

interface HeadSilhouetteProps {
  className?: string;
}

export default function HeadSilhouette({ className }: HeadSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 400 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={`
          M 215 18
          C 270 12, 320 35, 348 78
          C 372 115, 382 158, 380 200
          C 378 238, 368 268, 350 295
          C 338 315, 330 328, 325 342
          C 320 355, 318 365, 318 378
          C 318 392, 322 405, 318 418
          C 314 432, 305 440, 295 450
          C 285 460, 280 468, 278 478
          L 275 510
          L 175 510
          L 175 478
          C 175 465, 170 452, 162 440
          C 152 425, 145 415, 148 400
          C 150 388, 158 378, 165 368
          C 172 358, 172 348, 168 336
          C 162 320, 148 312, 140 298
          C 132 284, 130 272, 135 260
          C 140 250, 150 245, 148 238
          C 142 228, 125 218, 112 202
          C 100 188, 95 172, 98 156
          C 100 142, 108 132, 118 125
          C 126 118, 120 106, 120 92
          C 121 70, 138 48, 165 32
          C 185 20, 200 18, 215 18
          Z
        `}
        fill="rgba(30,30,30,0.13)"
      />
      {/* Ear hint */}
      <path
        d={`
          M 140 260
          C 128 265, 118 278, 116 292
          C 114 305, 120 315, 130 318
          C 125 310, 122 295, 128 280
          C 132 270, 138 263, 140 260
          Z
        `}
        fill="rgba(30,30,30,0.13)"
      />
    </svg>
  );
}
