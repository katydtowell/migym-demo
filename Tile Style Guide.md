# MiGym Home Screen Tile Style Guide

**For:** Development handoff
**Source:** MiGym App Builder prototype (`index.html`)
**Visual reference:** [MiGym Tile Style Guide — Figma](https://www.figma.com/design/uQNe5KPTXm1bIhb7UPJUTW/MiGym-Tile-Style-Guide?node-id=0-1&t=kyqPJsRoIYhTfkgi-1)

This is a short, developer-facing spec covering **only the values that differ from the existing app template** — border, fill, padding, gap, icon size, label/text-to-icon gaps, and typography for the home-screen tiles. Schedule view icons and styling are covered in a separate guide ([Schedule View.md](./Schedule%20View.md)).

All values are lifted directly from the prototype. Source line references in `index.html` are noted for each spec.

The Figma file linked above is the canonical visual reference for tile anatomy, spacing, and typography — inspect any tile there to see exact measurements alongside the values in this document.

---

## 1. Tile specs

| Spec | Value | Source |
|---|---|---|
| Tile border | **3px solid**, Primary Brand Color (contrast-corrected), **12px radius** | `index.html:5444`, `1491` |
| Tile fill | **transparent** | `index.html:5443` |
| Inside-tile padding | **10px** on all four sides (uniform across every tile layout) | `index.html:1490`, `1816`, `1867`, `1895` |
| Tile gap (both axes) | **10px** between tiles in a row, and **10px** between rows | `index.html:1473`, `6208`, `4656` |
| Icon size | **38px × 38px**, source viewBox `0 0 24 24` | `index.html:1496`, `1838`, `5480` |
| Gap between tile label and icon (vertical) — top-label layout | **4px** row-gap between the label (row 1) and the icon (row 2) | `index.html:1865` |
| Gap between tile label and icon (horizontal) — horizontal layout | **10px** between the text column (left) and the icon (right) | `index.html:1894` |

Notes:
- Media tiles (Gallery, Image) are exceptions: no border, image bleeds to the 12px rounded corner.
- Social brand tiles (YouTube, Facebook, X, Instagram) keep the 3px / 12px frame but have no label — the brand glyph sits centered.

---

## 2. Typography

**Font stack:** `'Roboto', Arial, Helvetica, sans-serif`

```css
font-family: 'Roboto', Arial, Helvetica, sans-serif;
```

Roboto is loaded from Google Fonts at weights 400/500/600/700/800. Arial and Helvetica serve as system-safe fallbacks if Roboto hasn't loaded yet on first paint, with a final generic `sans-serif` as the last-resort fallback.

| Element | Size | Weight | Style | Source |
|---|---|---|---|---|
| Tile label | **14px** | **600** | — | `index.html:1492`, `1815`, `5460`, `5472` |
| Tile dynamic text ("Your text here", "Additional text here") | **12px** | **400** | **(no italic — plain)** line-height 1.2 | `index.html:1847–1852` |

---

## 3. Related guides

Schedule view icons and styling are documented separately — this guide covers the home screen tiles only. See **[Schedule View.md](./Schedule%20View.md)** for the Schedule view icon list, sizes, and color application.

For the home-screen tile Lucide glyphs themselves (which icon each tile uses), see **[Tile Style Guide Icons.svg](./Tile%20Style%20Guide%20Icons.svg)** — a visual reference sheet with the 21 home-screen tile icons labeled by tile ID and Lucide name.

---

## Quick-reference summary

| Spec | Value |
|---|---|
| Tile border | 3px solid, Primary Brand Color, 12px radius |
| Tile fill | transparent |
| Inside-tile padding (all four sides) | 10px |
| Tile gap (both axes) | 10px |
| Icon size (home-screen tiles) | 38 × 38 |
| Gap between tile label and icon (vertical) | 4px |
| Gap between tile label and icon (horizontal) | 10px |
| Font stack | `'Roboto', Arial, Helvetica, sans-serif` |
| Tile label | 14px / 600 |
| Tile dynamic text | 12px / 400 (no italic) |
