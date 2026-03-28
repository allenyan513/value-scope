# Peer Selection

All peer selection MUST go through `resolvePeers()` in `src/lib/db/resolve-peers.ts`. Never call `getPeersByIndustry()` or FMP `/stock-peers` directly for peer resolution.

## Strategy
1. **FMP `/stock-peers`** first — returns business-relationship-based peers (better quality than pure industry match)
2. **Filter**: must exist in our `companies` table AND market_cap >= 1% of subject's market_cap (filters noise)
3. **Fallback**: if FMP yields < 3 valid peers → DB industry match (with sector fallback if industry < 3), same market cap floor
4. Default limit: 10 peers

## Callers
- `computePeerMetricsFromDB()` — Trading Multiples page (P/E, EV/EBITDA with forward estimates)
- `computePeerEBITDAMultiples()` — DCF EBITDA Exit page
- `getPeerEVEBITDAMedianFromDB()` — Terminal value anchor for DCF EBITDA Exit model
- `getCoreTickerData()` — Summary page peer metrics
- `/api/valuation/[ticker]` — API endpoint

## Display Rules
- Peer table must only show peers with valid trailing data for the active multiple (filter in `peer-table.tsx`)
- Market cap displayed in millions ($M) using `formatMillions()` from `@/lib/format`
