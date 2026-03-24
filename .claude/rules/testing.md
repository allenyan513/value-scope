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
