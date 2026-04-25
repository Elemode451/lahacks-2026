# Animations

## Easing Curves

All transitions use Apple-style spring or cubic-bezier easing. Never use `linear` or default `ease`.

| Name             | Value                                           | Usage                          |
|------------------|-------------------------------------------------|--------------------------------|
| `ease-out-expo`  | `cubic-bezier(0.16, 1, 0.3, 1)`                | Primary — panels, overlays     |
| `ease-in-out`    | `cubic-bezier(0.76, 0, 0.24, 1)`               | Symmetric — morphs, fades      |
| `spring`         | `type: "spring", stiffness: 300, damping: 30`   | Bouncy — buttons, expand       |
| `spring-gentle`  | `type: "spring", stiffness: 200, damping: 25`   | Gentle — layout shifts         |

## Duration Scale

| Token     | Duration | Usage                          |
|-----------|----------|--------------------------------|
| `fast`    | 150ms    | Micro-interactions, hovers     |
| `normal`  | 300ms    | Fades, color transitions       |
| `smooth`  | 500ms    | Panel slides, layout shifts    |
| `slow`    | 800ms    | Full-page transitions          |
| `dramatic`| 1200ms   | Import expand, processing blur |

## Transition Patterns

### Import Button → Import Overlay (Apple Expand)
1. Button records its bounding rect
2. Container morphs from button size/position to overlay size/position
3. Uses `spring` easing with slight overshoot
4. Content fades in after container reaches 60% of final size
5. Background blur fades in simultaneously

### Import Confirm → Processing
1. Form content fades out (300ms, ease-in-out)
2. Container shrinks and fades (500ms, ease-out-expo)
3. Background blur fades out (400ms)
4. Brain flashes white twice (150ms on, 100ms off, 150ms on)

### Processing → Dashboard
1. TopBar height reduces smoothly (500ms, ease-out-expo)
2. Brain container slides left and shrinks (800ms, spring-gentle)
3. Right panel slides in from right edge (800ms, ease-out-expo, 200ms delay)
4. Panel content fades in staggered (each item 100ms delay)

### Hover Effects
- Buttons: `scale(1.02)` with `fast` duration
- Cards: subtle `translateY(-2px)` with soft shadow increase
- All hovers use `ease-out-expo`

## Rules

- Every state change must be animated. No jump cuts.
- Stagger child animations by 50-100ms for lists.
- Use `will-change` sparingly, only on actively animating elements.
- Prefer `transform` and `opacity` for GPU-accelerated performance.
