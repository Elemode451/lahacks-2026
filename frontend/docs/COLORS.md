# Color Palette

## Base

| Token              | Hex       | Usage                                      |
|--------------------|-----------|---------------------------------------------|
| `--bg`             | `#FFFDF5` | Warm off-white background                   |
| `--navy`           | `#0d3b66` | Primary text, silhouettes, structural fills  |

## Heatmap Scale (data visualization only)

| Token              | Hex       | Region                 |
|--------------------|-----------|------------------------|
| `--heatmap-hot`    | `#f95738` | Tomato — highest activation, primary actions |
| `--heatmap-mid`    | `#ee964b` | Sandy Brown — mid activation, secondary UI   |
| `--heatmap-low`    | `#f4d35e` | Royal Gold — low activation, accents          |

## Glassmorphism

```css
.glass {
  background: rgba(255, 253, 245, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
}
```

## Rules

- Never use heatmap colors for structural elements.
- The navy is the only dark color — use it for text, icons, and silhouettes.
- Glassmorphic surfaces use `rgba(255, 253, 245, 0.6)` with blur.
- Active/hover states may brighten heatmap-hot by 10%.
