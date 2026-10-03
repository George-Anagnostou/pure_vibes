# Glass Box — Design System

Owner: Kathryn (design, front end). Source of truth for look and feel.
Figma: [Hackathon file](https://www.figma.com/design/yNdLWLQJvQTgqF8mheKGYo/Hackathon)
— key frames: `3-17` (mobile ranking), `5-2031` (desktop two-column),
`5-1799` (tablet + revealed close).

## Voice

The agent speaks in first person, lowercase italic "i":
**"Here is how _i_ will approach [prompt summary]."** Short, calm,
plain words. The product shows what a plan optimizes for, so the UI
stays quiet and lets the ranking be the drama.

## Type

| Role            | Face                               | Usage                                                                                           |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Display         | **Sentinel Book** (italic for "i") | Headlines, `clamp(1.7rem…2.3rem)`, centered, `text-wrap: pretty`, max-width 580px (2 lines max) |
| Values          | **Sentinel Book**                  | Priority tile names (1.125rem)                                                                  |
| Values (strong) | **Sentinel Semibold** (weight 500) | Stated/revealed values, hard-line labels, stat numbers                                          |
| UI              | **PP Mori Regular**                | Labels (0.72–0.78rem), body, buttons                                                            |
| Wordmark        | `public/logo.svg`                  | App bar, 16px tall. Never set the name in type when the mark fits.                              |

Self-hosted via `next/font/local` in `fonts.ts` (vars `--font-serif`,
`--font-sans`). Licensed from Kathryn's library — confirm web-embed
terms before public production.

## Color

- Ink: `#000`, secondary `rgba(0,0,0,.55)`, tertiary `rgba(0,0,0,.45)`
- Icon gray: `#5A5A5A` (plus icon fill)
- Critical red: `#c62828` (hard-line breaches, revealed close, critical flags)
- Drift amber: `#ed9b00` / label `#a05a00` · OK green: `#2e7d32`
- **Frosted sky ground**: vertical gradient `#afc9ee → #cdddf4 → #e7ebf2 → #f4efe7`
  (blue zenith to warm horizon), fixed attachment, with huge blurred white
  cloud radials drifting 90s ease-in-out alternate (disabled under
  `prefers-reduced-motion`).

## Liquid glass surfaces

Tiles refract the sky; never use flat white cards.

```css
background: rgba(255, 255, 255, 0.42);
backdrop-filter: blur(16px) saturate(1.6);
border: 1px solid rgba(255, 255, 255, 0.55);
box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.85),
  /* specular top edge */ 0 2px 8px rgba(40, 50, 80, 0.07);
border-radius: 12px; /* 16px for group cards, 20px for trays */
```

Dark glass (Continue, toggles-on, confirm mark): `rgba(10,10,12,.78–.82)`

- blur + inset `rgba(255,255,255,.28)` top edge. **No outer drop shadows
  on buttons** — flat, only the inset edge.

## Components

- **Priority tile**: 64px min, radius 12, label "Priority N" (PP Mori,
  0.75rem) over name (Sentinel Book 1.125rem), 2×3 dot grip right
  (`radial-gradient` dots, 14×24px).
- **Reveal-to-remove**: no visible close at rest. Tap a tile _or_ start
  dragging it → grip slides **10px left** (200ms) and a **red ×** fades
  in at the tile's **top-right corner** (180ms, 4px rise). Tap toggles
  off; <5px pointer movement = tap, ≥5px = drag.
- **Drag**: pointer-events on the whole tile, slot arithmetic (row
  height + 8px gap), live reorder, lifted tile gets deeper shadow.
  #1 tile reads slightly stronger (shadow only).
- **Options group card** ("Additional optional values you may add"):
  radius 16 glass card; vertical rows of [plus icon + label], left
  aligned; reasons in 0.68rem under the label; critical rows tint icon
  and reason red; added rows dim to 40% with "· added".
- **Plus icon**: `plus-icon.tsx` (Kathryn's SVG, 14px, currentColor).
- **Dials**: glass row cards; 4px track `#e5e5ea`-on-glass, 22px black
  thumb; end labels swap weight/color by active side.
- **Hard lines**: glass rows, Sentinel Semibold labels, black iOS-style
  toggles (46×27), budget gets inline `$` number input.
- **CTAs**: primary **Continue** — black glass, radius 14, 54px, PP Mori;
  secondary **Save defaults** — white glass, 1px `rgba(0,0,0,.3)` border,
  48px. Stacked, primary on top, in the sticky right rail.
- **App bar**: sticky frosted strip `rgba(255,255,255,.75)` + blur;
  left "Profile : Account" link (15px outline person icon), centered
  logo, empty right side for balance.
- **Dashboard**: stat cards (Sentinel numbers), review cards with
  status pills (amber pending / green approved), event feed with
  colored dots; breach rows get a 3px red inset edge.

## Layout

- Mobile-first single column, shell 440px.
- ≥960px: two columns `1.15fr / 0.85fr`, 32px gutter — content left,
  sticky rail right (options card → cost → CTAs), columns top-aligned
  (watch the global `section { margin-top }` from the starter; `.card`
  zeroes it).
- Headlines and section titles centered; group-card titles left.

## Files

Everything lives in Kathryn's lane: `src/components/glassbox/`
(`glassbox.module.css` is the whole system; `fonts.ts`, `top-bar.tsx`,
`priority-list.tsx`, `alignment-form.tsx`, `plus-icon.tsx`,
`mock.ts` — TEMP shadow types until `src/lib/glassbox/types.ts` lands),
plus pages under `src/app/{approve/[id],dashboard,profile}` and
`public/logo.svg`. No Tailwind, no UI deps — plain CSS modules.
