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

## Known Duplication (avoid adding more)
`MODEL_NAMES` record is duplicated in summary-card.tsx, model-card.tsx, model-card-compact.tsx. When modifying model names, update all three (or extract to shared constant).
