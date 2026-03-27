# ValuScope TODO

## Features
- [ ] Stripe Price IDs configuration, domain setup

---

## Performance Optimizations

### Deferred
- [ ] Parallelize seed FMP API calls — `lib/data/seed.ts`; intentional rate limiting (300 req/min), could batch 4-5 in parallel
- [ ] Dynamic import for Recharts components — `price-value-chart.tsx`, `estimate-chart.tsx`, `price-targets-summary.tsx`; use `next/dynamic` to defer ~80KB from initial bundle
