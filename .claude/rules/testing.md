---
paths:
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Testing Conventions

## Runner & Config
- Vitest — config in `vitest.config.ts`
- Run `npm test` before committing any logic changes

## What to Test
- Valuation models: edge cases (negative earnings, missing data, zero values)
- API routes: auth checks, error responses, cache behavior
- Helpers with branching logic, state transitions, error handling
- **Skip**: pure UI components, one-liner glue code, simple re-exports

## Fixtures
- Shared test data in `__tests__/fixtures.ts` — modeled after real financial patterns
- Reuse existing fixtures; extend when needed for new edge cases
- Financial values are raw numbers (not millions) — match production convention

## Patterns
- Test N/A cases: models should return `fair_value = 0` with explanatory `note` in assumptions
- Test fallback paths: peer-based multiples when < 100 historical data points
- Test boundary values: growth rates at clamp limits (MIN_GROWTH_RATE / MAX_GROWTH_RATE)
- Historicals must be sorted descending by fiscal_year (most recent first)

## Performance Tests — REQUIRED for data fetching changes
When modifying data fetching functions (data.ts, API routes, query functions):
- **Parallelism guard**: Mock dependencies with fixed delay (100ms), assert total time < N×delay. See `src/app/[ticker]/__tests__/data.perf.test.ts` for pattern.
- **Over-fetching guard**: Assert that functions do NOT call dependencies they shouldn't. Example: `getCoreTickerData` must NOT call `getPriceTargets`.
- **New data function? Add timing test.** If you create a new `cache()` function with multiple queries, add a test that mocks all calls with delay and verifies they run in parallel.
- **New page data dependency?** If a page starts consuming a new data source, verify it doesn't add that dependency to a shared function that other pages also call.
