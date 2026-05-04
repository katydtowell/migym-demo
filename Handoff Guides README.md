# MiGym — Handoff Guides

Start here. This folder contains all the instructional materials for taking over the MiGym App Builder prototype. The code files for the prototype itself (`index.html`, `api/`, `vercel.json`, `package.json`) live at the root of the handoff package, alongside this folder.

## Visual reference (live, canonical)

- **[MiGym Tile Style Guide — Figma](https://www.figma.com/design/uQNe5KPTXm1bIhb7UPJUTW/MiGym-Tile-Style-Guide?node-id=0-1&t=kyqPJsRoIYhTfkgi-1)** — the canonical visual reference for tile anatomy, spacing, and typography. Inspect any tile to read exact measurements directly from the design file.

## Guides in this folder

| File | What it covers | When to read it |
|---|---|---|
| [Tile Style Guide.md](./Tile%20Style%20Guide.md) | Home-screen tile border, fill, padding, gap, icon size, label spacing, and typography — with source line references in `index.html`. | First, when implementing or reviewing home-screen tile UI. Pair with the Figma file above. |
| [Tile Style Guide Icons.svg](./Tile%20Style%20Guide%20Icons.svg) | Visual reference sheet of the Lucide icons used on the **home-screen tiles**, labeled by tile ID and Lucide name. | When you need to see the glyph each home-screen tile uses at a glance. |
| [Tile and Schedule Icons.zip](./Tile%20and%20Schedule%20Icons.zip) | The 19 Lucide SVG files required to build the home-screen tiles and the Schedule view (filled style — fills instead of outlines). Each file is named for its Lucide glyph. | When you're implementing tiles or the Schedule view and need the actual SVGs. |
| [icons.zip](./icons.zip) | The full library of Lucide icons (filled style, 1695 SVGs). Use as a reference when adding new features that need glyphs beyond the required set. | When you need any icon outside the required-set shortlist above. |
| [Schedule View.md](./Schedule%20View.md) | Schedule view icons (header menu, search, map-pin; class-row action buttons) with rendered sizes, color treatment, and source line references. | When implementing or reviewing the Schedule view. |
| [Deployment Handoff.md](./Deployment%20Handoff.md) | What lives only in the Vercel deployment (not in the repo), what env vars are required, how the `/api/submit` and `/api/upload-blob` endpoints work, and how to swap out Resend / Vercel Blob for your own providers. | Before provisioning production. |
| [App Store Asset Specification.xlsx](./App%20Store%20Asset%20Specification.xlsx) | Sizes, formats, and placement rules for the app-store icons the builder generates (iOS / Android / web). | When handing assets to the mobile build. |

## Suggested reading order

1. Open the **Figma style guide** — get a visual on what the home-screen tiles should look like.
2. Read **Tile Style Guide.md** — the numbers matching what you saw in Figma, plus source line references.
3. Read **Schedule View.md** — the separate icon/styling spec for the Schedule view.
4. Read **Deployment Handoff.md** — understand what needs to be provisioned in production before you touch the code.
5. Reference **Tile Style Guide Icons.svg** and **App Store Asset Specification.xlsx** as needed during implementation.
