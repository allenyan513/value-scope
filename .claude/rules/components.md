---
paths:
  - "src/components/**"
---

# Component Conventions

## Client vs Server
- Client components: must have `"use client"` at top
- Server components: layout wrappers and data-fetching parents — no directive needed
- Auth UI: check `!loading` before rendering to avoid layout shift

## shadcn/ui
All UI primitives from `@/components/ui/` (Button, Card, Badge, Input, etc.). Combine with Tailwind inline styles. Never install competing UI libraries.

## Props
- Always use TypeScript interfaces with `Props` suffix: `interface Props { ... }`
- Model details are loosely typed (`Record<string, unknown>`) — check field existence before using:
  ```ts
  if ("peers" in model.details && Array.isArray(model.details.peers)) { ... }
  ```

## N/A Model Handling
When `fair_value === 0`, model is N/A (company doesn't qualify). Always check before rendering details.

## Formatting — Use Shared Utilities
- `formatLargeNumber()`, `formatCurrency()`, `formatMillions()` from `@/lib/format`
- `getUpsideColor()` for verdict colors
- `toDateString()` for date display
- **Never** create inline formatting functions or use raw `.toFixed()` in components

## val-* CSS Class System (valuation pages)
All `/valuation` sub-pages use semantic CSS classes defined in `globals.css @layer components`:
- `val-page` — page wrapper (`space-y-6`)
- `val-h2` — page-level heading
- `val-card` — card container (`rounded-lg border bg-card p-6 space-y-6`)
- `val-h3` — section heading inside cards (uppercase, muted)
- `val-card-title` — larger card title (not uppercase)
- `val-stats` — stat row grid (`grid-cols-2 md:grid-cols-4`)
- `val-stat-label` / `val-stat-value` — stat label and value
- `val-prose` — narrative paragraph
- `val-row` / `val-row-label` / `val-row-highlight` / `val-row-primary` — key-value rows

**Never** use raw Tailwind for heading/card/stat patterns in valuation pages — use val-* classes. To change styling, edit the class definition in `globals.css`, not individual pages.

## ValuationHero Component
`src/components/valuation/valuation-hero.tsx` — unified stat-row + narrative for all valuation model pages.
- Always shows 4 columns: Fair Value, Market Price, Upside/Downside, Verdict
- Verdict is auto-derived from upside (≥0 = Undervalued/green, <0 = Overvalued/red)
- **Never** duplicate the stat-row pattern inline — use `<ValuationHero>` instead

## MethodologyCard Component
`src/components/valuation/methodology-card.tsx` — shared "Methodology" section for all valuation model pages.
- Takes `paragraphs: string[]` — renders each as a `<p>` inside `val-card` + `val-card-title` + `val-prose`
- Server component (no "use client")
- Used by: DCF (3 variants), P/E Multiples, EV/EBITDA Multiples, PEG, WACC
- **Never** inline methodology text in a page — use this component

## PEGGauge Component
`src/components/valuation/peg-gauge.tsx` — PEG ratio visualization for the PEG Fair Value page.
- Color-coded gauge bar (green/yellow/red zones) with pointer
- Formula breakdown, rule of thumb, growth classification (Slow Grower / Stalwart / Fast Grower)
- Client component ("use client")

## SummaryCard Component
`src/components/valuation/summary-card.tsx` — Main summary page table with tree-style pillar grouping.
- Accepts `strategySwitcher` slot (ReactNode) rendered next to the heading
- Three display modes driven by `consensus_strategy`: `dcf_primary` (no consensus footer, no pillar values), `median` (pillar values + consensus footer), `weighted` (same layout as median)
- `MODEL_NAMES` record maps model_type → display name (9 models). If adding models, update here.
