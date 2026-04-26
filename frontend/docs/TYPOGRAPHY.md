# Typography

## Font Families

### Zodiak (Display / Headings)
- **Source:** [Fontshare](https://www.fontshare.com/fonts/zodiak)
- **Usage:** Logo, large metrics, section headers
- **Feel:** Editorial, premium serif
- **Weights:** 400 (Regular), 700 (Bold)

### Switzer (Body / UI / Labels)
- **Source:** [Fontshare](https://www.fontshare.com/fonts/switzer)
- **Usage:** Dense data, metrics, navigation, body text
- **Feel:** Clean, legible sans-serif
- **Weights:** 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)

## Type Scale

| Element          | Font    | Weight | Size     | Line Height | Letter Spacing |
|------------------|---------|--------|----------|-------------|----------------|
| Logo             | Zodiak  | 700    | 32px     | 1.1         | -0.02em        |
| Section Header   | Zodiak  | 600    | 24px     | 1.2         | -0.01em        |
| Metric Large     | Zodiak  | 700    | 48px     | 1.0         | -0.03em        |
| Body             | Switzer | 400    | 16px     | 1.5         | 0              |
| Label            | Switzer | 500    | 13px     | 1.4         | 0.02em         |
| Caption          | Switzer | 400    | 12px     | 1.4         | 0.01em         |
| Button           | Switzer | 600    | 14px     | 1.0         | 0.02em         |

## CSS Variables

```css
--font-display: 'Zodiak', Georgia, serif;
--font-body: 'Switzer', -apple-system, sans-serif;
```

## Rules

- Zodiak is exclusively for display text. Never use it for body copy or UI labels.
- Switzer handles all functional text.
- Use negative letter-spacing on large display sizes for tighter, editorial feel.
