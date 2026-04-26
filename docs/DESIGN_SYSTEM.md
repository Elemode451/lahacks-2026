# Seratone Design System & Implementation Guide

> Comprehensive design documentation for enhancing Seratone's UI/UX while preserving the existing design language. This document covers animation systems, micro-interactions, 3D/WebGL enhancements, UI patterns, and detailed implementation blueprints with code examples.

---

## Table of Contents

1. [Current Design Audit](#1-current-design-audit)
2. [Animation System Enhancements](#2-animation-system-enhancements)
3. [Micro-Interactions & Transitions](#3-micro-interactions--transitions)
4. [3D & WebGL Enhancements](#4-3d--webgl-enhancements)
5. [UI/UX Pattern Improvements](#5-uiux-pattern-improvements)
6. [Audio-Reactive Design](#6-audio-reactive-design)
7. [View Transitions & Page Flow](#7-view-transitions--page-flow)
8. [Typography & Motion Typography](#8-typography--motion-typography)
9. [Loading States & Progress Design](#9-loading-states--progress-design)
10. [Accessibility & Performance](#10-accessibility--performance)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. Current Design Audit

### 1.1 Existing Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React + Next.js (App Router) | SSR with `"use client"` components |
| Styling | Tailwind CSS v4 | Custom theme with CSS variables |
| Animation | Framer Motion (`motion/react`) | Spring physics, AnimatePresence, layout animations |
| 3D | Three.js + React Three Fiber + drei | Brain mesh, orbit controls |
| Charts | Recharts | Radar chart for music attributes |
| Shaders | Custom GLSL (ColorBends, MagicRings, Noise) | WebGL via Three.js ShaderMaterial |
| Icons | Lucide React + Custom SVG components | Consistent icon set |
| UI Primitives | Radix UI (shadcn/ui pattern) | Accessible primitives in figma-make-project |
| Font | Switzer (via Fontshare) | Variable weight: 400–700 |

### 1.2 Color Palette

```
--bg:           #FFFDF5  (warm cream)
--navy:         #0D3B66  (deep navy — primary text)
--heatmap-hot:  #F95738  (coral red — CTAs, accents)
--heatmap-mid:  #EE964B  (warm orange — secondary)
--heatmap-low:  #F4D35E  (golden yellow — tertiary)
```

The palette is warm and organic, evoking neural warmth. Login uses a dark gradient (`#0a0a12` → `#0d1520` → `#0a0f1a`).

### 1.3 Existing Animation Patterns

| Pattern | Implementation | Location |
|---------|---------------|----------|
| Panel spring expansion | `type: "spring", stiffness: 300, damping: 30, mass: 1.5` | Import pill → panel |
| Layout slide | `duration: 0.8, ease: [0.16, 1, 0.3, 1]` (custom cubic-bezier) | Brain slide, topbar, right panel |
| Staggered fade-in | `opacity` with `delay` offsets | Logo, analysis panel |
| Brain flash | CSS `@keyframes brain-flash` with brightness pulse | Processing state |
| Auto-rotation | `OrbitControls autoRotate={true} autoRotateSpeed={0.5}` | 3D brain idle state |
| Audio-reactive shader | WebGL uniforms driven by `uAudioIntensity` | ColorBends background |
| Login rings | Concentric expanding rings with noise + parallax | MagicRings on login page |
| Mount/unmount | `AnimatePresence` with opacity/scale transitions | View state changes |

### 1.4 Strengths to Preserve

- **The pill-to-panel morph** — distinctive interaction pattern; the spring physics feel tactile and premium
- **ColorBends shader** — audio-reactive, organic, custom — defines the brand visual identity
- **3D brain mesh** — the hero visual; vertex-colored heatmap with emissive flash is unique
- **MagicRings login** — dark, atmospheric, sets the mood before the light main experience
- **Warm color palette** — unusual for a tech product; creates emotional warmth matching the "vibes" concept
- **Switzer font** — clean, modern, slightly humanist; complements the organic palette

---

## 2. Animation System Enhancements

### 2.1 Framer Motion Advanced Patterns

The app already uses Framer Motion well. Here are specific patterns to layer on top.

#### 2.1.1 Layout ID Shared Element Transitions

When transitioning between views (intro → importing → analysis), elements like the brain mesh or song items can morph smoothly using `layoutId`.

```tsx
// Song item in import list
<motion.div layoutId={`song-${song.id}`} className="...">
  <span>{song.title}</span>
</motion.div>

// Same song in analysis recommendations panel
<motion.div layoutId={`song-${song.id}`} className="...">
  <span>{song.title}</span>
  <span>{song.artist}</span>
</motion.div>
```

When both exist in the tree with `AnimatePresence`, Framer Motion will automatically FLIP-animate between them. This creates a visual thread connecting the import flow to the analysis results.

**Where to apply in Seratone:**
- Song URL chips in the import panel → song cards in the recommendations list
- Import pill button → expanded panel header (the word "import" could morph)
- Brain position from center (intro) to left (analysis) already slides, but `layoutId` would make it feel more connected

#### 2.1.2 Stagger Orchestration for List Reveals

The song recommendations list and radar chart labels should cascade in:

```tsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.3,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 30,
    },
  },
};

// In SongRecommendations component:
<motion.div variants={container} initial="hidden" animate="show">
  {SONGS.map((song, i) => (
    <motion.div key={i} variants={item} className="...">
      {/* song content */}
    </motion.div>
  ))}
</motion.div>
```

**Timing recommendation:** 60ms stagger for 6 items = 360ms cascade, starting 300ms after the analysis panel slides in. This creates a waterfall effect that draws the eye down the list.

#### 2.1.3 Scroll-Linked Animations with `useScroll`

For the analysis panel's scrollable content, tie visual feedback to scroll position:

```tsx
import { useScroll, useTransform, motion } from "framer-motion";

function AnalysisPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  
  // Fade the radar chart as user scrolls past it
  const radarOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0.4]);
  const radarScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.92]);
  
  // Parallax the brain visualization
  const brainY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  return (
    <div ref={containerRef} className="overflow-y-auto">
      <motion.div style={{ opacity: radarOpacity, scale: radarScale }}>
        <MusicRadarChart />
      </motion.div>
      {/* ... */}
    </div>
  );
}
```

This creates a sense of depth as the user explores their analysis results.

#### 2.1.4 `useMotionValue` for Continuous Animations

Wire mouse position to subtle parallax on the brain:

```tsx
import { useMotionValue, useTransform, useSpring } from "framer-motion";

function BrainParallax({ children }: { children: React.ReactNode }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [5, -5]), {
    stiffness: 150,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-5, 5]), {
    stiffness: 150,
    damping: 20,
  });

  return (
    <motion.div
      style={{ rotateX, rotateY, perspective: 1000 }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left - rect.width / 2);
        mouseY.set(e.clientY - rect.top - rect.height / 2);
      }}
      onMouseLeave={() => {
        mouseX.set(0);
        mouseY.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
```

**Application:** Wrap the `BrainScene` component in `BrainParallax` during the intro state to create a subtle 3D tilt effect on mouse movement, making the brain feel tangible before the user even clicks "import."

#### 2.1.5 Gesture-Based Drag Interactions

Add drag-to-dismiss for song chips in the import panel:

```tsx
<motion.div
  drag="x"
  dragConstraints={{ left: 0, right: 0 }}
  dragElastic={0.4}
  onDragEnd={(_, info) => {
    if (Math.abs(info.offset.x) > 100) {
      handleRemoveSong(index);
    }
  }}
  animate={{ x: 0 }}
  className="..."
>
  <span>{song.title}</span>
  <X className="size-4" />
</motion.div>
```

This mobile-friendly pattern lets users swipe songs away, complementing the existing X button. Framer Motion's `dragElastic` provides rubber-band physics that feel native.

### 2.2 GSAP Integration (Complementary)

GSAP excels at timeline-based orchestration and scroll-driven effects that go beyond Framer Motion's declarative model. Use it selectively alongside Framer Motion.

#### 2.2.1 GSAP ScrollTrigger for Analysis Page

If the analysis view evolves into a scrollable, multi-section layout (radar → overview → recommendations → social), GSAP ScrollTrigger provides powerful pinning and scrub:

```tsx
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

function AnalysisScrollView() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useGSAP(() => {
    // Pin the radar chart while text scrolls beside it
    ScrollTrigger.create({
      trigger: ".radar-section",
      start: "top top",
      end: "+=200%",
      pin: true,
      pinSpacing: true,
    });

    // Animate radar data points sequentially on scroll
    gsap.fromTo(".radar-dot", 
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        stagger: 0.1,
        scrollTrigger: {
          trigger: ".radar-section",
          start: "top center",
          end: "center center",
          scrub: 1,
        },
      }
    );
  }, { scope: containerRef });

  return <div ref={containerRef}>{/* sections */}</div>;
}
```

**When to use GSAP vs Framer Motion:**
- Framer Motion: Component-level enter/exit, gestures, layout, hover/tap
- GSAP: Complex multi-element timelines, scroll-pinning, text splitting, SVG morphing

#### 2.2.2 GSAP SplitText for Typography Animation

Animate the analysis overview text with character-level reveals:

```tsx
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

function AnimatedOverview({ text }: { text: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  
  useGSAP(() => {
    if (!textRef.current) return;
    const split = new SplitText(textRef.current, { type: "words,chars" });
    
    gsap.from(split.chars, {
      opacity: 0,
      y: 20,
      rotationX: -90,
      stagger: 0.02,
      duration: 0.5,
      ease: "back.out(1.7)",
      scrollTrigger: {
        trigger: textRef.current,
        start: "top 80%",
      },
    });
  });

  return (
    <p ref={textRef} className="text-[#0d3b66] text-sm leading-relaxed">
      {text}
    </p>
  );
}
```

This creates a premium feel when the AI-generated overview text appears — each word tumbles into place.

### 2.3 Lottie/Rive for Micro-Interactions

#### 2.3.1 Rive State Machines for Interactive Icons

Rive animations respond to user input via state machines, perfect for the import type toggle:

```tsx
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

function ImportTypeIcon({ type, active }: { type: ImportType; active: boolean }) {
  const { rive, RiveComponent } = useRive({
    src: `/animations/${type}-icon.riv`,
    stateMachines: "toggle",
    autoplay: true,
  });
  
  const isActive = useStateMachineInput(rive, "toggle", "isActive");
  
  useEffect(() => {
    if (isActive) isActive.value = active;
  }, [active, isActive]);

  return <RiveComponent className="w-6 h-6" />;
}
```

**Where to use Rive in Seratone:**
- Import type icons (file/spotify/youtube) — morph between states with fluid animation
- Processing brain icon — animated neural activity during analysis
- Success/error feedback — brain lighting up green vs showing error state
- Onboarding animations — walkthrough illustrations

#### 2.3.2 Lottie for Loading States

Replace the CSS spinner with a brain-themed Lottie animation:

```tsx
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

function BrainLoader() {
  return (
    <DotLottieReact
      src="/animations/brain-pulse.lottie"
      loop
      autoplay
      className="w-16 h-16"
    />
  );
}
```

**Design the Lottie animation to:**
- Show a simplified brain outline that pulses with the heatmap colors (#f95738 → #ee964b → #f4d35e)
- Neural pathways light up sequentially, suggesting processing
- 2-3 second loop, smooth easing

### 2.4 Spring Physics Comparison & Recommendations

| Library | Bundle Size | Best For | Seratone Use Case |
|---------|------------|---------|-------------------|
| **Framer Motion** (current) | ~32KB | Declarative UI animations, gestures, layout | Primary animation system — keep |
| **React Spring** | ~18KB | Physics-driven, interruptible, continuous | Fluid data visualizations, spring chains |
| **Motion One** | ~2KB | Micro-animations, performance-critical | Lightweight hover effects on many elements |
| **Popmotion** | ~12KB | Low-level animation values | Already bundled inside Framer Motion |

**Recommendation:** Stick with Framer Motion as primary. Consider adding Motion One (~2KB) for performance-critical list animations where Framer Motion's overhead per element might accumulate (e.g., animating 50+ song recommendation items).

```tsx
// Motion One for lightweight list hover effects
import { animate } from "motion";

function SongItem({ song }: { song: Song }) {
  const ref = useRef<HTMLDivElement>(null);
  
  return (
    <div
      ref={ref}
      onMouseEnter={() => animate(ref.current!, { x: 4 }, { duration: 0.2 })}
      onMouseLeave={() => animate(ref.current!, { x: 0 }, { duration: 0.3 })}
    >
      {song.title}
    </div>
  );
}
```

---

## 3. Micro-Interactions & Transitions

### 3.1 Button State Transitions

The current import button is good but can be elevated with multi-state feedback:

```tsx
function ImportButton({ onClick }: { onClick: () => void }) {
  const [state, setState] = useState<"idle" | "hover" | "pressed">("idle");
  
  return (
    <motion.button
      className="relative overflow-hidden rounded-full bg-[rgba(249,87,56,0.32)] backdrop-blur-[40px]"
      onHoverStart={() => setState("hover")}
      onHoverEnd={() => setState("idle")}
      onTapStart={() => setState("pressed")}
      onTap={() => { setState("idle"); onClick(); }}
      animate={{
        scale: state === "pressed" ? 0.96 : state === "hover" ? 1.02 : 1,
        boxShadow: state === "hover"
          ? "0 8px 32px rgba(249, 87, 56, 0.25)"
          : "0 2px 8px rgba(249, 87, 56, 0.1)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <motion.div
        className="absolute inset-0 bg-[rgba(249,87,56,0.15)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: state === "hover" ? 1.5 : 0,
          opacity: state === "hover" ? 1 : 0,
        }}
        style={{ borderRadius: "50%", transformOrigin: "center" }}
      />
      <span className="relative z-10 font-medium text-xl text-[#f95738]">
        import
      </span>
      <SoundBarsIcon className="relative z-10 size-6" />
    </motion.button>
  );
}
```

### 3.2 Import Panel Expansion — Enhanced Spring Curve

The current spring (stiffness: 300, damping: 30, mass: 1.5) is solid. For more premium feel, add subtle rotation and shadow during expansion:

```tsx
animate={{
  width: viewState === "intro" ? layout.pillW : layout.panelW,
  height: viewState === "intro" ? layout.pillH : layout.panelH,
  x: viewState === "intro" ? layout.pillX : layout.panelX,
  y: viewState === "intro" ? layout.pillY : layout.panelY,
  borderRadius: viewState === "intro" ? 100 : 50,
  // NEW: Subtle rotation during morph for organic feel
  rotate: viewState === "importing" ? 0 : 0,
  // NEW: Dynamic shadow expansion
  boxShadow: viewState === "importing"
    ? "0 24px 80px -12px rgba(249, 87, 56, 0.3), 0 0 0 1px rgba(249, 87, 56, 0.1)"
    : "0 4px 16px -4px rgba(249, 87, 56, 0.15)",
}}
transition={{
  type: "spring",
  stiffness: 280,    // slightly softer
  damping: 28,        // slightly less damped = more bounce
  mass: 1.2,          // lighter = faster initial response
  // Stagger internal content fade
  opacity: { delay: 0.15, duration: 0.3 },
}}
```

### 3.3 File Upload — Drag & Drop Polish

Enhance the file upload area with visual feedback:

```tsx
function DropZone({ onDrop }: { onDrop: (files: FileList) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  
  return (
    <motion.div
      className="relative flex-1 flex flex-col items-center justify-center rounded-[30px]"
      animate={{
        scale: isDragging ? 1.02 : 1,
        borderColor: isDragging ? "#f95738" : "rgba(249, 87, 56, 0.4)",
      }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        onDrop(e.dataTransfer.files);
      }}
    >
      {/* Animated border — dashes rotate when dragging */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <motion.rect
          x="1.5" y="1.5"
          width="calc(100% - 3px)" height="calc(100% - 3px)"
          rx="30" ry="30"
          fill="none"
          stroke="#f95738"
          strokeWidth="3"
          strokeDasharray="12 8"
          animate={{
            strokeDashoffset: isDragging ? [0, -40] : 0,
            opacity: isDragging ? 0.8 : 0.4,
          }}
          transition={{
            strokeDashoffset: { repeat: Infinity, duration: 1, ease: "linear" },
          }}
        />
      </svg>
      
      {/* Pulsing upload icon */}
      <motion.div
        animate={{
          y: isDragging ? -4 : 0,
          scale: isDragging ? 1.1 : 1,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <UploadIcon className="w-9 h-9 mb-4 text-[#f95738]" />
      </motion.div>
      
      <p className="text-base font-medium text-[#f95738]">
        {isDragging ? "Drop your tracks" : "Drag and drop files here"}
      </p>
    </motion.div>
  );
}
```

### 3.4 Song Chip Enter/Exit Animations

Each added song should enter with personality:

```tsx
<AnimatePresence>
  {songs.map((song, idx) => (
    <motion.div
      key={song}
      layout  // animate position changes when siblings are added/removed
      initial={{ opacity: 0, scale: 0.8, x: -20 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{
        opacity: 0,
        scale: 0.8,
        x: 100,
        transition: { duration: 0.2, ease: "easeIn" },
      }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
        delay: idx * 0.05, // stagger on initial render
      }}
      className="relative bg-[rgba(249,87,56,0.08)] border border-[rgba(249,87,56,0.2)] rounded-full"
    >
      {/* ... song content ... */}
    </motion.div>
  ))}
</AnimatePresence>
```

The `layout` prop ensures remaining chips smoothly collapse when one is removed, rather than jumping.

### 3.5 Hover Card for Song Recommendations

Add depth to the recommendation list with hover previews:

```tsx
function SongCard({ song, index }: { song: Song; index: number }) {
  return (
    <motion.div
      className="group relative flex items-center gap-2.5 px-2 py-2 rounded-xl cursor-pointer"
      whileHover={{
        backgroundColor: "rgba(249, 87, 56, 0.06)",
        x: 4,
        transition: { type: "spring", stiffness: 400, damping: 25 },
      }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Rank number */}
      <motion.span
        className="text-[#0d3b66]/25 text-[10px] tabular-nums w-3 shrink-0 text-right"
        whileHover={{ color: "#f95738", scale: 1.2 }}
      >
        {index + 1}
      </motion.span>
      
      <div className="flex-1 min-w-0">
        <p className="text-[#0d3b66] text-[11px] font-medium truncate">{song.title}</p>
        <p className="text-[#0d3b66]/45 text-[10px] truncate mt-0.5">{song.artist}</p>
      </div>
      
      {/* Tag slides in on hover */}
      <motion.span
        className="text-[#f95738]/40 text-[8px] uppercase tracking-wider"
        initial={{ opacity: 0.4, x: 0 }}
        whileHover={{ opacity: 1, x: -4 }}
      >
        {song.tag}
      </motion.span>
      
      {/* Play icon appears on hover */}
      <motion.div
        className="absolute right-2 text-[#f95738]"
        initial={{ opacity: 0, scale: 0.5 }}
        whileHover={{ opacity: 0.6, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        ▶
      </motion.div>
    </motion.div>
  );
}
```

---

## 4. 3D & WebGL Enhancements

### 4.1 Post-Processing Effects for the Brain

Add bloom and vignette to make the brain mesh glow, especially during the flash/analysis phase.

#### 4.1.1 Selective Bloom on Brain Mesh

```tsx
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";

function EnhancedBrainScene({ flashing, interactive, activationLevel }: BrainSceneProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const brainRef = useRef<THREE.Mesh>(null);

  return (
    <Canvas
      camera={{ position: [0, 1.5, 4.2], fov: 52 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.85} />
      <directionalLight ref={lightRef} position={[2, 6, 5]} intensity={0.85} />
      
      <Suspense fallback={null}>
        <BrainMesh ref={brainRef} flashing={flashing} activationLevel={activationLevel} />
      </Suspense>
      
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={!interactive}
        autoRotateSpeed={0.5}
      />
      
      {/* Post-processing pipeline */}
      <EffectComposer>
        <Bloom
          intensity={flashing ? 2.5 : 0.8}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.4}
          kernelSize={KernelSize.MEDIUM}
        />
        <Vignette eskil={false} offset={0.2} darkness={0.4} />
      </EffectComposer>
    </Canvas>
  );
}
```

**Effect:** The brain mesh emissive glow (#f95738) bleeds into surrounding space, creating an ethereal heatmap aura. During flashing, the bloom intensity ramps up, making the pulse effect dramatically more vivid.

#### 4.1.2 Chromatic Aberration During Processing

Add a subtle chromatic aberration during the "analyzing" state for a sci-fi diagnostic feel:

```tsx
import { ChromaticAberration } from "@react-three/postprocessing";

<EffectComposer>
  <Bloom intensity={0.8} luminanceThreshold={0.6} />
  {flashing && (
    <ChromaticAberration
      offset={new THREE.Vector2(0.002, 0.002)}
      radialModulation
      modulationOffset={0.5}
    />
  )}
</EffectComposer>
```

### 4.2 Enhanced Brain Material

Replace the basic `MeshStandardMaterial` with a custom shader material for more control:

```tsx
const brainShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vColor;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      vColor = color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uActivation;
    uniform float uFlashIntensity;
    uniform vec3 uHotColor;   // #f95738
    uniform vec3 uMidColor;   // #ee964b
    uniform vec3 uLowColor;   // #f4d35e
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vColor;
    
    void main() {
      // Fresnel rim lighting
      vec3 viewDir = normalize(-vPosition);
      float fresnel = pow(1.0 - dot(viewDir, vNormal), 3.0);
      
      // Base color from vertex colors
      vec3 baseColor = vColor;
      
      // Activation glow — blend toward hot color based on activation level
      vec3 glowColor = mix(uLowColor, mix(uMidColor, uHotColor, uActivation), uActivation);
      
      // Pulsing based on activation
      float pulse = sin(uTime * 3.0) * 0.5 + 0.5;
      float glowAmount = fresnel * (0.3 + uActivation * 0.7 + uFlashIntensity * pulse);
      
      vec3 finalColor = mix(baseColor, glowColor, glowAmount);
      
      // Add emissive flash
      finalColor += uHotColor * uFlashIntensity * pulse * 0.5;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};
```

**Benefits over current approach:**
- Fresnel rim lighting creates an edge glow that changes with viewing angle
- Activation level drives color transitions through the heatmap palette
- Pulse timing is per-vertex rather than a flat flash, creating a wave of neural activity

### 4.3 Particle System for Neural Activity

Add floating particles around the brain during analysis:

```tsx
import { Points, PointMaterial } from "@react-three/drei";
import * as random from "maath/random/dist/maath-random.esm";

function NeuralParticles({ active }: { active: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const [sphere] = useState(() => 
    random.inSphere(new Float32Array(2000 * 3), { radius: 3 })
  );

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x -= delta / 15;
    ref.current.rotation.y -= delta / 20;
    
    // Pulse opacity based on time
    const material = ref.current.material as THREE.PointsMaterial;
    material.opacity = active ? 0.6 + Math.sin(state.clock.elapsedTime * 2) * 0.2 : 0;
  });

  return (
    <group>
      <Points ref={ref} positions={sphere} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#f95738"
          size={0.015}
          sizeAttenuation
          depthWrite={false}
          opacity={0}
        />
      </Points>
    </group>
  );
}
```

**Effect:** Tiny coral-colored particles orbit the brain, suggesting neural activity. They fade in when analysis starts and pulse gently during the analysis state.

### 4.4 Audio-Reactive Brain Mesh Displacement

Connect the Web Audio API to displace brain vertices:

```tsx
function AudioReactiveBrain({ audioAnalyser }: { audioAnalyser: AnalyserNode | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const originalPositions = useRef<Float32Array | null>(null);
  
  useFrame(() => {
    if (!meshRef.current || !audioAnalyser) return;
    const geo = meshRef.current.geometry;
    const positions = geo.getAttribute("position");
    
    // Store original positions on first frame
    if (!originalPositions.current) {
      originalPositions.current = new Float32Array(positions.array);
    }
    
    // Get frequency data
    const data = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(data);
    
    // Average of low frequencies (bass)
    const bass = data.slice(0, 10).reduce((a, b) => a + b, 0) / (10 * 255);
    // Average of mid frequencies
    const mid = data.slice(10, 50).reduce((a, b) => a + b, 0) / (40 * 255);
    
    // Displace vertices along normals based on frequency
    const normals = geo.getAttribute("normal");
    const orig = originalPositions.current;
    
    for (let i = 0; i < positions.count; i++) {
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);
      
      // Mix bass and mid influence based on vertex position (height)
      const y = orig[i * 3 + 1];
      const influence = y > 0 ? bass : mid; // top of brain = bass, bottom = mid
      const displacement = influence * 0.15;
      
      positions.setXYZ(
        i,
        orig[i * 3] + nx * displacement,
        orig[i * 3 + 1] + ny * displacement,
        orig[i * 3 + 2] + nz * displacement,
      );
    }
    positions.needsUpdate = true;
  });
  
  return <mesh ref={meshRef}>{/* ... */}</mesh>;
}
```

**Effect:** The brain mesh subtly "breathes" with the music — bass frequencies expand the top of the brain while mids affect the lower regions. This creates a direct visual connection between the audio being analyzed and the brain visualization.

### 4.5 Enhanced ColorBends Background

The existing ColorBends shader is excellent. Here are targeted enhancements:

#### 4.5.1 Multi-Color Mode Based on Analysis Results

Currently ColorBends uses a single navy color. After analysis, transition to the user's music profile colors:

```tsx
// Derive colors from analysis results
const backgroundColors = useMemo(() => {
  if (!analysisResult) return ["#0D3B66"];
  
  const energy = (analysisResult as Record<string, number>).energy ?? 50;
  const valence = (analysisResult as Record<string, number>).valence ?? 50;
  
  // High energy + high valence = warm oranges
  // High energy + low valence = deep reds
  // Low energy + high valence = golden yellows
  // Low energy + low valence = cool navy
  const colors: string[] = [];
  if (energy > 60) colors.push("#F95738");
  if (valence > 60) colors.push("#F4D35E");
  if (energy < 40) colors.push("#0D3B66");
  colors.push("#EE964B"); // always include mid
  
  return colors.length ? colors : ["#0D3B66"];
}, [analysisResult]);

<ColorBends
  ref={colorBendsRef}
  colors={backgroundColors}
  speed={0.2}
  frequency={1}
  warpStrength={1}
  scale={1}
  intensity={1.5}
/>
```

#### 4.5.2 Mesh Gradient Alternative (Stripe-Style)

For a more contemporary alternative to ColorBends, consider `@mesh-gradient/core`:

```tsx
import { MeshGradient } from "@mesh-gradient/react";

function ModernBackground() {
  return (
    <MeshGradient
      colors={["#0D3B66", "#F95738", "#EE964B", "#F4D35E"]}
      speed={0.3}
      className="absolute inset-0 opacity-30"
    />
  );
}
```

This library (~8KB gzip) provides SwiftUI-style mesh gradients with WebGL rendering and smooth transitions between color configurations. It would complement the existing ColorBends rather than replace it.

### 4.6 Camera Transitions in 3D Scene

Smooth camera movements when transitioning between views:

```tsx
import { useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";

function SmartCamera({ viewState }: { viewState: ViewState }) {
  const controlsRef = useRef<CameraControls>(null);
  
  useEffect(() => {
    if (!controlsRef.current) return;
    
    switch (viewState) {
      case "intro":
        // Wide, slightly elevated view
        controlsRef.current.setLookAt(0, 2, 5, 0, 0, 0, true);
        break;
      case "analysis":
        // Closer, more dramatic angle
        controlsRef.current.setLookAt(-1, 1.5, 3.5, 0, 0.3, 0, true);
        break;
      case "processing":
        // Slowly zoom in during analysis
        controlsRef.current.setLookAt(0, 1.2, 3, 0, 0, 0, true);
        break;
    }
  }, [viewState]);

  return <CameraControls ref={controlsRef} makeDefault smoothTime={1.2} />;
}
```

---

## 5. UI/UX Pattern Improvements

### 5.1 Glassmorphism System

The login page already uses glassmorphism (`bg-white/5 backdrop-blur-md`). Systematize it:

```tsx
// components/GlassCard.tsx
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: "light" | "medium" | "heavy";
  dark?: boolean;
}

const glassStyles = {
  light: {
    light: "bg-white/[0.03] backdrop-blur-sm border-white/[0.06]",
    dark: "bg-[#0d3b66]/[0.03] backdrop-blur-sm border-[#0d3b66]/[0.06]",
  },
  medium: {
    light: "bg-white/[0.08] backdrop-blur-md border-white/[0.12]",
    dark: "bg-[#0d3b66]/[0.06] backdrop-blur-md border-[#0d3b66]/[0.1]",
  },
  heavy: {
    light: "bg-white/[0.15] backdrop-blur-lg border-white/[0.2]",
    dark: "bg-[#0d3b66]/[0.1] backdrop-blur-lg border-[#0d3b66]/[0.15]",
  },
};

export function GlassCard({
  children,
  className = "",
  intensity = "medium",
  dark = false,
}: GlassCardProps) {
  const mode = dark ? "dark" : "light";
  return (
    <div className={`rounded-2xl border ${glassStyles[intensity][mode]} ${className}`}>
      {children}
    </div>
  );
}
```

**Application points:**
- Wrap the analysis panel content in a glass card
- Use for the chat interface container
- Apply to the radar chart background
- Use for tooltip/popover overlays

### 5.2 Responsive Layout System

The current app uses fixed pixel dimensions. Implement a responsive layout:

```tsx
const layout = useMemo(() => {
  const isCompact = vw < 768;
  const isMedium = vw >= 768 && vw < 1024;
  const contentH = vh - TOPBAR_H;
  
  if (isCompact) {
    // Mobile: stack vertically
    return {
      brainW: vw * 0.9,
      brainH: contentH * 0.4,
      brainIntroX: vw * 0.05,
      brainAnalysisX: vw * 0.05,
      brainTop: TOPBAR_H + 10,
      panelW: vw * 0.95,
      panelH: contentH * 0.85,
      panelX: vw * 0.025,
      panelY: TOPBAR_H + contentH * 0.075,
      rightPanelW: vw,
      // Analysis uses bottom sheet on mobile
      analysisMode: "bottomSheet" as const,
    };
  }
  
  if (isMedium) {
    // Tablet: brain smaller, panel overlays
    return {
      brainW: Math.min(contentH * 0.7, vw * 0.5),
      brainH: Math.min(contentH * 0.7, vw * 0.5),
      // ... adapted values
      analysisMode: "overlay" as const,
    };
  }
  
  // Desktop: current layout
  const halfW = vw * 0.5;
  const brainSize = Math.min(contentH * 0.95, halfW);
  return {
    brainW: brainSize,
    brainH: brainSize,
    brainIntroX: (vw - brainSize) / 2,
    brainAnalysisX: (halfW - brainSize) / 2,
    brainTop: TOPBAR_H + (contentH - brainSize) / 2,
    panelW: Math.min(vw * 0.72, 920),
    panelH: Math.min(contentH * 0.88, 650),
    panelX: (vw - Math.min(vw * 0.72, 920)) / 2,
    panelY: TOPBAR_H + (contentH - Math.min(contentH * 0.88, 650)) / 2,
    rightPanelW: halfW,
    analysisMode: "splitScreen" as const,
  };
}, [vw, vh]);
```

### 5.3 Mobile Bottom Sheet for Analysis

On mobile, the analysis panel should slide up as a bottom sheet:

```tsx
import { Sheet } from "vaul"; // Already in dependencies!

function MobileAnalysisSheet({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <Sheet.Root open={open}>
      <Sheet.Portal>
        <Sheet.Overlay className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        <Sheet.Content className="fixed bottom-0 left-0 right-0 bg-[#fffdf5] rounded-t-[32px] max-h-[85vh]">
          <Sheet.Handle className="bg-[#0d3b66]/15" />
          <div className="p-6 overflow-y-auto">
            {children}
          </div>
        </Sheet.Content>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
```

Note: `vaul` is already in your dependencies! This is a natural fit for mobile analysis viewing.

### 5.4 Enhanced Chat Interface

The chat can be made more engaging:

```tsx
function ChatBubble({ message, index }: { message: Message; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
        delay: message.role === "ai" ? 0.3 : 0, // AI responses appear with slight delay
      }}
      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`text-xs leading-relaxed rounded-2xl px-3 py-2 max-w-[90%] ${
          message.role === "user"
            ? "bg-[#f95738] text-white" // User messages in solid coral
            : "bg-[rgba(13,59,102,0.06)] text-[#0d3b66]/70" // AI in subtle navy
        }`}
      >
        {message.role === "ai" ? (
          <TypewriterText text={message.text} speed={20} />
        ) : (
          message.text
        )}
      </div>
    </motion.div>
  );
}

// Typewriter effect for AI responses
function TypewriterText({ text, speed = 20 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  
  useEffect(() => {
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  
  return <>{displayed}<span className="animate-pulse">|</span></>;
}
```

### 5.5 Empty State & Onboarding

For first-time users, replace the plain brain with an inviting onboarding state:

```tsx
function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      className="absolute z-30 inset-0 flex items-center justify-center pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="text-center pointer-events-auto"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-[#0d3b66]/40 text-sm tracking-tight max-w-xs mx-auto leading-relaxed">
          Add songs that share a vibe.
          <br />
          We'll map their brain-response fingerprints.
        </p>
        
        <motion.div
          className="mt-4 text-[#f95738]/50 text-xs"
          animate={{ y: [0, 4, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          ↑ Click import to begin
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
```

### 5.6 Skeleton Loading for Analysis Results

While waiting for analysis data, show skeleton placeholders:

```tsx
function AnalysisSkeleton() {
  return (
    <div className="px-10 pt-8 pb-8 flex flex-col">
      {/* Timeline skeleton */}
      <div className="max-w-[260px] mx-auto w-full">
        <div className="h-2 bg-[#0d3b66]/5 rounded-full animate-pulse" />
      </div>
      
      {/* Radar skeleton */}
      <div className="flex justify-center mt-4">
        <div className="w-[240px] h-[200px] rounded-full bg-[#0d3b66]/3 animate-pulse" />
      </div>
      
      {/* Chat skeleton */}
      <div className="mt-6 space-y-3">
        {[0.8, 0.6, 0.9].map((width, i) => (
          <motion.div
            key={i}
            className="h-8 bg-[#0d3b66]/5 rounded-2xl"
            style={{ width: `${width * 100}%` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{
              repeat: Infinity,
              duration: 1.5,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Audio-Reactive Design

### 6.1 Web Audio API Integration

Create a central audio analysis context:

```tsx
// lib/audio-context.tsx
"use client";

import { createContext, useContext, useRef, useState, useCallback } from "react";

interface AudioAnalysis {
  bass: number;       // 0-1, low frequency energy
  mid: number;        // 0-1, mid frequency energy
  treble: number;     // 0-1, high frequency energy
  volume: number;     // 0-1, overall volume
  waveform: Uint8Array | null;
  frequency: Uint8Array | null;
}

interface AudioContextValue {
  analysis: AudioAnalysis;
  connectSource: (source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode) => void;
  isActive: boolean;
}

const AudioAnalysisContext = createContext<AudioContextValue>({
  analysis: { bass: 0, mid: 0, treble: 0, volume: 0, waveform: null, frequency: null },
  connectSource: () => {},
  isActive: false,
});

export function AudioAnalysisProvider({ children }: { children: React.ReactNode }) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis>({
    bass: 0, mid: 0, treble: 0, volume: 0, waveform: null, frequency: null,
  });
  const [isActive, setIsActive] = useState(false);
  const rafRef = useRef<number>(0);

  const analyze = useCallback(() => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const waveformData = new Uint8Array(analyser.fftSize);
    
    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(waveformData);
    
    const binCount = analyser.frequencyBinCount;
    const bassEnd = Math.floor(binCount * 0.1);
    const midEnd = Math.floor(binCount * 0.5);
    
    let bassSum = 0, midSum = 0, trebleSum = 0;
    for (let i = 0; i < binCount; i++) {
      const val = frequencyData[i] / 255;
      if (i < bassEnd) bassSum += val;
      else if (i < midEnd) midSum += val;
      else trebleSum += val;
    }
    
    setAnalysis({
      bass: bassSum / bassEnd,
      mid: midSum / (midEnd - bassEnd),
      treble: trebleSum / (binCount - midEnd),
      volume: frequencyData.reduce((a, b) => a + b, 0) / (binCount * 255),
      waveform: waveformData,
      frequency: frequencyData,
    });
    
    rafRef.current = requestAnimationFrame(analyze);
  }, []);

  const connectSource = useCallback((source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    
    const analyser = audioCtxRef.current.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    
    source.connect(analyser);
    analyser.connect(audioCtxRef.current.destination);
    analyserRef.current = analyser;
    
    setIsActive(true);
    rafRef.current = requestAnimationFrame(analyze);
  }, [analyze]);

  return (
    <AudioAnalysisContext.Provider value={{ analysis, connectSource, isActive }}>
      {children}
    </AudioAnalysisContext.Provider>
  );
}

export const useAudioAnalysis = () => useContext(AudioAnalysisContext);
```

### 6.2 Audio-Reactive UI Elements

Wire the audio context to visual elements:

```tsx
// Audio-reactive progress ring around the radar chart
function AudioReactiveRing() {
  const { analysis, isActive } = useAudioAnalysis();
  
  if (!isActive) return null;
  
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-[#f95738]"
      animate={{
        scale: 1 + analysis.bass * 0.05,
        opacity: 0.2 + analysis.volume * 0.6,
        borderColor: analysis.bass > 0.6 ? "#f95738" : 
                     analysis.mid > 0.5 ? "#ee964b" : "#f4d35e",
      }}
      transition={{ duration: 0.1 }}
    />
  );
}
```

### 6.3 Waveform Visualization Component

```tsx
function WaveformDisplay({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { analysis } = useAudioAnalysis();
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis.waveform) return;
    
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    const data = analysis.waveform;
    
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = "#f95738";
    ctx.lineWidth = 2;
    
    const sliceWidth = w / data.length;
    let x = 0;
    
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      
      x += sliceWidth;
    }
    
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }, [analysis.waveform]);
  
  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={60}
      className={`${className} opacity-60`}
    />
  );
}
```

---

## 7. View Transitions & Page Flow

### 7.1 Next.js View Transitions API

Next.js now supports the View Transitions API natively. Enable it:

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
```

Then use `<ViewTransition>` from React for cross-route morphing:

```tsx
import { ViewTransition } from "react";

// On the login page — name the logo for cross-route morphing
function LoginPage() {
  return (
    <ViewTransition name="seratone-logo">
      <SeratoneLogo className="h-[50px] w-auto text-white" />
    </ViewTransition>
  );
}

// On the main page — same name = browser morphs between them
function MainPage() {
  return (
    <ViewTransition name="seratone-logo">
      <SeratoneLogo className="h-[41px] w-auto" />
    </ViewTransition>
  );
}
```

**Transition between login → main:**
- Logo morphs from white (dark bg) to navy (light bg)
- Background crossfades from dark to cream
- MagicRings fade out as ColorBends fade in

### 7.2 Custom View Transition Animations

```css
/* globals.css */

/* Crossfade default for all navigations */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Logo morph between pages */
::view-transition-old(seratone-logo),
::view-transition-new(seratone-logo) {
  animation-duration: 0.6s;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Slide transition for forward navigation */
@keyframes slide-from-right {
  from { transform: translateX(30px); opacity: 0; }
}

@keyframes slide-to-left {
  to { transform: translateX(-30px); opacity: 0; }
}

::view-transition-old(page-content) {
  animation: slide-to-left 0.3s ease-in forwards;
}

::view-transition-new(page-content) {
  animation: slide-from-right 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

### 7.3 Internal View State Transitions

For the app's internal view states (intro → importing → processing → analysis), add crossfade layers:

```tsx
// Wrap view state content for smoother transitions
function ViewStateTransition({ viewState, children }: { viewState: ViewState; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewState}
        initial={{ opacity: 0, filter: "blur(4px)" }}
        animate={{ opacity: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, filter: "blur(4px)" }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

---

## 8. Typography & Motion Typography

### 8.1 Variable Font Animation

Switzer is a variable font. Animate font weight on hover:

```tsx
function AnimatedHeading({ children }: { children: string }) {
  return (
    <motion.h1
      className="text-[#0d3b66] tracking-tight"
      style={{ fontVariationSettings: '"wght" 400' }}
      whileHover={{
        fontVariationSettings: '"wght" 700',
        transition: { duration: 0.3 },
      }}
    >
      {children}
    </motion.h1>
  );
}
```

### 8.2 Text Reveal Animation

For the analysis overview text:

```tsx
function WordReveal({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  
  return (
    <motion.p className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.25em]"
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.4,
            delay: 0.5 + i * 0.03, // 30ms per word
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </motion.p>
  );
}
```

### 8.3 Kinetic Typography for Song Titles

Animated song title reveals in the recommendation list:

```tsx
function KineticTitle({ text, delay = 0 }: { text: string; delay?: number }) {
  const letters = text.split("");
  
  return (
    <span className="inline-flex overflow-hidden">
      {letters.map((letter, i) => (
        <motion.span
          key={i}
          initial={{ y: "100%" }}
          animate={{ y: "0%" }}
          transition={{
            duration: 0.5,
            delay: delay + i * 0.015,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="inline-block"
        >
          {letter === " " ? "\u00A0" : letter}
        </motion.span>
      ))}
    </span>
  );
}
```

---

## 9. Loading States & Progress Design

### 9.1 Brain-Scan Processing Animation

Replace the simple spinner with a brain-themed processing animation:

```tsx
function BrainProcessingOverlay({
  progress,
  total,
  status,
}: {
  progress: number;
  total: number;
  status: string;
}) {
  const pct = total > 0 ? progress / total : 0;
  
  return (
    <motion.div
      className="absolute z-30 flex flex-col items-center justify-center"
      style={{ inset: 0 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Frosted overlay */}
      <div className="absolute inset-0 bg-[#fffdf5]/80 backdrop-blur-lg" />
      
      <div className="relative z-10 flex flex-col items-center">
        {/* Animated concentric rings (like brain scan) */}
        <div className="relative w-24 h-24 mb-8">
          {[0, 1, 2].map((ring) => (
            <motion.div
              key={ring}
              className="absolute inset-0 rounded-full border-2"
              style={{
                borderColor: ring === 0 ? "#f95738" : ring === 1 ? "#ee964b" : "#f4d35e",
                inset: ring * 8,
              }}
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.3, 0.8, 0.3],
              }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                delay: ring * 0.3,
                ease: "easeInOut",
              }}
            />
          ))}
          
          {/* Center brain icon */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center text-[#f95738]"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
          >
            🧠
          </motion.div>
        </div>
        
        {/* Progress bar */}
        <div className="w-48 mb-4">
          <div className="w-full h-1.5 rounded-full bg-[rgba(249,87,56,0.1)] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: "linear-gradient(90deg, #f4d35e, #ee964b, #f95738)",
              }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[#0d3b66]/30 text-[10px]">{progress}/{total}</span>
            <span className="text-[#f95738]/60 text-[10px]">{Math.round(pct * 100)}%</span>
          </div>
        </div>
        
        {/* Status text with typing effect */}
        <motion.p
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[#0d3b66]/50 text-sm text-center max-w-sm"
        >
          {status}
        </motion.p>
      </div>
    </motion.div>
  );
}
```

### 9.2 Stepped Progress Indicator

Show analysis stages explicitly:

```tsx
const STAGES = [
  { label: "Downloading", icon: "↓" },
  { label: "Extracting audio", icon: "♪" },
  { label: "Running TRIBE v2", icon: "🧠" },
  { label: "Computing similarity", icon: "≈" },
  { label: "Generating profile", icon: "★" },
];

function SteppedProgress({ currentStage }: { currentStage: number }) {
  return (
    <div className="flex items-center gap-2">
      {STAGES.map((stage, i) => (
        <motion.div
          key={i}
          className="flex items-center gap-1.5"
          animate={{
            opacity: i <= currentStage ? 1 : 0.3,
            scale: i === currentStage ? 1.05 : 1,
          }}
        >
          <motion.span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
              ${i < currentStage ? "bg-[#f95738] text-white" : 
                i === currentStage ? "bg-[rgba(249,87,56,0.2)] text-[#f95738]" : 
                "bg-[#0d3b66]/5 text-[#0d3b66]/30"}`}
            animate={i === currentStage ? {
              boxShadow: ["0 0 0 0 rgba(249,87,56,0)", "0 0 0 8px rgba(249,87,56,0.2)", "0 0 0 0 rgba(249,87,56,0)"],
            } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            {i < currentStage ? "✓" : stage.icon}
          </motion.span>
          {i < STAGES.length - 1 && (
            <div className={`w-8 h-px ${i < currentStage ? "bg-[#f95738]" : "bg-[#0d3b66]/10"}`} />
          )}
        </motion.div>
      ))}
    </div>
  );
}
```

---

## 10. Accessibility & Performance

### 10.1 Reduced Motion Support

All animations should respect `prefers-reduced-motion`:

```tsx
// lib/motion-preferences.ts
import { useReducedMotion } from "framer-motion";

export function useAnimationConfig() {
  const shouldReduceMotion = useReducedMotion();
  
  return {
    // Replace spring with instant for reduced motion
    spring: shouldReduceMotion
      ? { type: "tween" as const, duration: 0 }
      : { type: "spring" as const, stiffness: 300, damping: 30 },
    
    // Skip delays
    stagger: shouldReduceMotion ? 0 : 0.06,
    
    // Reduce or eliminate transitions
    duration: shouldReduceMotion ? 0 : 0.8,
    
    // Disable parallax and continuous animations
    enableParallax: !shouldReduceMotion,
    enableAudioReactive: !shouldReduceMotion,
  };
}
```

Apply globally:

```tsx
// In globals.css
@media (prefers-reduced-motion: reduce) {
  .brain-flash {
    animation: none;
  }
  
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 10.2 Performance Budgets

| Animation Type | Target | Measurement |
|---------------|--------|-------------|
| Layout animations | < 16ms per frame (60fps) | Chrome DevTools Performance |
| WebGL rendering | < 8ms per frame | Three.js Stats |
| Bundle impact | < 50KB additional gzip | webpack-bundle-analyzer |
| First paint | < 1.5s | Lighthouse |
| Total blocking time | < 200ms | Lighthouse |

### 10.3 GPU Layer Management

```css
/* Promote animated elements to their own compositor layer */
.animate-layer {
  will-change: transform, opacity;
  contain: layout style paint;
}

/* Remove will-change after animation completes */
.animate-layer.settled {
  will-change: auto;
}
```

### 10.4 Three.js Performance Optimizations

```tsx
// Limit frame rate when not visible
function AdaptiveFramerate() {
  const { gl } = useThree();
  const visible = useRef(true);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { visible.current = entry.isIntersecting; },
      { threshold: 0.1 }
    );
    observer.observe(gl.domElement);
    return () => observer.disconnect();
  }, [gl]);
  
  useFrame((state) => {
    // Reduce to 30fps when not visible
    if (!visible.current) {
      state.gl.setAnimationLoop(null);
    }
  });
  
  return null;
}
```

### 10.5 Lazy Loading Strategy

```tsx
// Current dynamic imports are correct. Add loading indicators:
const BrainScene = dynamic(() => import("@/components/BrainScene"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#f95738] border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});
```

---

## 11. Implementation Roadmap

### Phase 1: Quick Wins (1-2 days)

These changes require minimal code and have high visual impact:

| Task | Effort | Impact |
|------|--------|--------|
| Add stagger animation to song recommendations list | 30 min | High — instant premium feel |
| Add `layout` prop to song chips in import panel | 15 min | Medium — smooth reflow on add/remove |
| Enhanced button hover states with spring physics | 45 min | High — tactile feedback |
| Skeleton loading for analysis panel | 1 hr | High — perceived performance |
| Chat typewriter effect for AI responses | 45 min | High — mimics real AI interaction |
| Word reveal animation for overview text | 30 min | Medium — polish |
| Drag-to-dismiss song chips | 30 min | Medium — mobile-friendly |

### Phase 2: Visual Depth (3-5 days)

More significant enhancements:

| Task | Effort | Impact |
|------|--------|--------|
| Post-processing (bloom + vignette) on brain | 2 hr | Very High — brain becomes iconic |
| Neural particles around brain | 2 hr | High — ambient life |
| Glassmorphism card system | 1 hr | Medium — design consistency |
| Enhanced processing overlay with scan rings | 2 hr | High — replaces spinner |
| View Transitions API for login → main | 1 hr | High — seamless route change |
| Audio-reactive background color changes | 2 hr | High — connects analysis to visual |
| Fresnel rim lighting on brain shader | 3 hr | Very High — 3D depth |

### Phase 3: Full Audio-Reactive Experience (1 week)

| Task | Effort | Impact |
|------|--------|--------|
| Web Audio API context provider | 4 hr | Foundation for all audio-reactive features |
| Audio-reactive brain mesh displacement | 4 hr | Very High — the "wow" moment |
| Waveform visualization component | 3 hr | High — audio feedback |
| GSAP ScrollTrigger for scrollable analysis | 4 hr | High — if analysis view grows |
| Rive state machine icons | 8 hr | Medium — requires animation creation |
| Mobile responsive layout + bottom sheet | 6 hr | High — mobile accessibility |
| Lottie brain loading animation | 4 hr | Medium — requires animation creation |

### Phase 4: Polish & Advanced (2 weeks)

| Task | Effort | Impact |
|------|--------|--------|
| Custom brain shader material | 1 day | Very High — unique visual identity |
| Mesh gradient background option | 4 hr | Medium — contemporary alternative |
| Kinetic typography for titles | 4 hr | Medium — editorial feel |
| Camera transitions in 3D scene | 4 hr | High — cinematic state changes |
| Social sharing card animations | 6 hr | Medium — viral potential |
| Full reduced-motion implementation | 4 hr | Critical — accessibility |
| Performance audit & optimization | 1 day | Critical — ensuring 60fps |

---

## Appendix A: Package Dependencies to Add

```json
{
  "dependencies": {
    "@react-three/postprocessing": "^3.0.0",
    "postprocessing": "^7.0.0",
    "@rive-app/react-canvas": "^4.0.0",
    "@lottiefiles/dotlottie-react": "^0.12.0",
    "gsap": "^3.12.0",
    "@gsap/react": "^2.1.0",
    "@mesh-gradient/react": "^1.5.0",
    "maath": "^0.10.0"
  }
}
```

Note: Only add packages as needed per phase. Avoid bloating the bundle.

## Appendix B: Design Token Reference

```css
/* Extended design tokens for animation consistency */
:root {
  /* Timing */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-in-out-sine: cubic-bezier(0.37, 0, 0.63, 1);
  
  /* Durations */
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-normal: 400ms;
  --duration-slow: 800ms;
  --duration-dramatic: 1200ms;
  
  /* Springs (for reference — use in Framer Motion) */
  /* Snappy: stiffness 500, damping 30 */
  /* Default: stiffness 300, damping 30 */
  /* Gentle: stiffness 150, damping 20 */
  /* Bouncy: stiffness 400, damping 15 */
  
  /* Stagger */
  --stagger-fast: 30ms;
  --stagger-default: 60ms;
  --stagger-slow: 100ms;
  
  /* Z-layers */
  --z-background: 0;
  --z-brain: 10;
  --z-overlay: 15;
  --z-panel: 20;
  --z-processing: 30;
  --z-toast: 40;
  --z-modal: 50;
  
  /* Shadows */
  --shadow-glow-sm: 0 0 20px rgba(249, 87, 56, 0.15);
  --shadow-glow-md: 0 0 40px rgba(249, 87, 56, 0.25);
  --shadow-glow-lg: 0 0 80px rgba(249, 87, 56, 0.35);
  --shadow-panel: 0 24px 80px -12px rgba(13, 59, 102, 0.15);
}
```

## Appendix C: Inspiration & References

### Animation Libraries
- [Framer Motion Docs](https://www.framer.com/motion/) — primary animation system
- [GSAP + React](https://gsap.com/resources/React/) — complex timelines and scroll
- [Rive](https://rive.app/) — state-machine driven interactive animations
- [LottieFiles](https://lottiefiles.com/) — lightweight micro-animations
- [Motion One](https://motion.dev/) — 2KB animation library for performance-critical paths

### Design Inspiration
- [Codrops 3D Audio Visualizer](https://tympanus.net/codrops/2025/06/18/coding-a-3d-audio-visualizer-with-three-js-gsap-web-audio-api/) — audio-reactive Three.js + GSAP
- [Awwwards Three.js Gallery](https://www.awwwards.com/websites/three-js/) — creative 3D web experiences
- [Allen Brain Atlas](https://atlas.brain-map.org/) — neuroscience visualization reference
- [Spotify Design](https://newsroom.spotify.com/2026-04-23/spotify-design-history/) — music app UI patterns
- [Alex Harri WebGL Gradients](https://alexharri.com/blog/webgl-gradients) — shader gradient techniques

### Technical References
- [Next.js View Transitions Guide](https://nextjs.org/docs/app/guides/view-transitions) — native view transitions
- [React Three Postprocessing](https://react-postprocessing.docs.pmnd.rs/) — bloom, selective glow
- [Web Audio API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — audio analysis
- [Mesh Gradient Library](https://meshgradientweb.vercel.app/) — modern gradient backgrounds
- [Stripe Gradient WebGL](https://gist.github.com/jordienr/64bcf75f8b08641f205bd6a1a0d4ce1d) — iconic gradient effect

---

*This document is a living design guide. Update it as the product evolves and new patterns are established.*
