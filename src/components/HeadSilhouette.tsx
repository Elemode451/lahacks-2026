"use client";

interface HeadSilhouetteProps {
  className?: string;
}

export default function HeadSilhouette({ className }: HeadSilhouetteProps) {
  return (
    <svg
      viewBox="0 0 500 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={`
          M 250 30
          C 310 25, 370 55, 400 110
          C 430 165, 435 210, 430 260
          C 425 310, 395 350, 370 380
          C 355 398, 345 410, 340 430
          C 335 450, 330 460, 330 480
          L 330 560
          L 200 560
          L 200 500
          C 200 480, 195 465, 185 445
          C 175 425, 170 415, 175 400
          C 180 385, 195 375, 200 365
          C 205 355, 200 345, 195 335
          C 188 322, 175 318, 170 305
          C 165 292, 168 280, 175 270
          C 155 262, 140 250, 130 235
          C 120 220, 118 208, 120 195
          C 122 185, 128 178, 138 172
          C 132 162, 128 148, 130 135
          C 133 115, 145 95, 165 75
          C 185 55, 215 35, 250 30
          Z
        `}
        fill="#0d3b66"
      />
    </svg>
  );
}
