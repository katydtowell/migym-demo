# MiGym Schedule View Style Guide

**For:** Development handoff
**Source:** MiGym App Builder prototype (`index.html`)

This guide documents the icons used on the Schedule view and how they're colored and sized. It's separate from the home-screen [Tile Style Guide](./Tile%20Style%20Guide.md) — the Schedule view has its own icon set, different rendered sizes, and different color treatment from the tiles.

All values are lifted directly from the prototype. Source line references in `index.html` are noted for each spec.

---

## 1. Icons

All icons on the Schedule view are from the Lucide library (`https://lucide.dev`) with a 24×24 source viewBox. The rendered pixel size below is the width/height at which each icon is displayed.

| Location on screen | Lucide icon | Rendered size | Notes | Source |
|---|---|---|---|---|
| Header — left-side menu toggle | `menu` | **20 × 20** | 3 horizontal lines (hamburger) | `index.html:3472`, `3627` |
| Header — search pill (inside "Search" placeholder) | `search` | **14 × 14** | magnifying glass; sits inside the rounded search field | `index.html:3474`, `3629` |
| Header — right-side location toggle | `map-pin` | **20 × 20** | same glyph as the home-screen `location` tile | `index.html:3477`, `3632` |
| Class row action — "Book it" button | `calendar-check` | **13 × 13** | calendar with a checkmark; on an available class | `index.html:3503`, `1580` |
| Class row action — "Add to Calendar" button | `calendar-plus` | **13 × 13** | calendar with a plus; on a class the user has booked | `index.html:3508`, `1580` |
| Class row action — "Waitlisted" button | `clock` | **13 × 13** | clock face; on a full class the user is waitlisted for | `index.html:3513`, `1580` |

Status-bar chrome (signal, wifi, battery) uses the OS-native bar on the real device; the prototype only draws representative placeholders, so those icons are out of scope for branding.

---

## 2. Color application

- The **menu / search / map-pin** icons inherit the header text color and render at 70% opacity (`style="opacity:.7"`) to read as subtle affordances.
- The **Book it / Add to Calendar / Waitlisted** icons render in the Primary Brand Color (same color as the button background's text-on-primary foreground). Sizing is enforced by `.preview-sched-book svg { width: 13px; height: 13px; }` at `index.html:1580`.

---

## Quick-reference summary

| Spec | Value |
|---|---|
| Header icons (menu, map-pin) | 20 × 20, header text color @ 70% opacity |
| Header search icon | 14 × 14, header text color @ 70% opacity |
| Class row action icons (calendar-check, calendar-plus, clock) | 13 × 13, Primary Brand Color |
| Icon source library | Lucide, 24 × 24 source viewBox |
