# Credit-Based Monetization System

> Implemented: 2026-03-28 | PR #54

## Business Model

**Credit-based, not subscription.** Each credit permanently unlocks 1 ticker.

| Concept | Detail |
|---------|--------|
| Unit | 1 credit = permanently unlock 1 ticker for a user |
| Free tickers | Configurable allowlist: AAPL, NVDA, MSFT, GOOGL, AMZN |
| Paid tickers | All others (~500 S&P 500). Must be logged in + ticker unlocked |
| Payment | One-time Stripe Checkout (`mode: "payment"`) — no recurring billing |

### Why Credits, Not Subscription

- **Pay-per-use fits the product**: like buying a research report for a specific company, not a gym membership
- **No perverse incentive**: subscription model profits when users don't use the service; credits encourage usage
- **AI-agent friendly**: MCP/API callers pay per ticker, not a flat monthly fee
- **Transparent cost**: users know exactly what they're paying for

### Credit Packs

| Pack | Price | Credits | Per-Stock | Key in `constants.ts` |
|------|-------|---------|-----------|----------------------|
| Trial | $9 | 5 | $1.80 | `trial_5` |
| Starter | $29 | 30 | $0.97 | `starter_30` |
| Pro | $99 | 500 | $0.20 | `pro_500` |

Source of truth: `CREDIT_PACKS` in `src/lib/constants.ts`.

---

## Architecture

### Content Gating: Client-Side, Not Server-Side

The most important architectural decision: **gating happens in the browser, not on the server.**

```
Server (ISR)                    Client (Hydration)
┌──────────────────┐           ┌──────────────────┐
│ Render full HTML │──────────>│ AccessGate checks │
│ (all content)    │           │ auth + credits    │
│ (SEO crawlers    │           │                   │
│  get everything) │           │ If denied:        │
└──────────────────┘           │ blur + paywall    │
                               └──────────────────┘
```

**Why this approach:**

1. **SEO**: Google sees full content (same pattern as NYT, WSJ, Bloomberg)
2. **ISR preserved**: Layout doesn't read cookies → `revalidate = 3600` still works
3. **No CLS**: Server-rendered content stays visible during hydration. Never show skeleton → content flash.

**Performance rules for AccessGate:**
- Free tickers: `isFreeTicker()` is a synchronous `Set.has()` — zero API calls, zero delay
- Logged-in users: **optimistic render** (show content first), only overlay paywall if API confirms no access
- Never replace SSR content with skeleton (this was explicitly avoided — see CLS discussion)

### Atomic Credit Operations (Postgres Functions)

Credits must be atomic to prevent double-spend:

```sql
-- unlock_ticker(user_id, ticker): row lock + deduct + insert in one transaction
UPDATE user_credits SET used = used + 1 WHERE user_id = $1 AND total > used;
INSERT INTO unlocked_tickers (user_id, ticker) VALUES ($1, $2);
-- Both or neither. UNIQUE constraint prevents duplicate unlocks.

-- add_user_credits(user_id, credits): idempotent upsert
INSERT INTO user_credits (user_id, total) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET total = total + $2;
```

Stripe webhook idempotency: `credit_purchases.stripe_session_id` has a UNIQUE constraint. Duplicate webhook calls are silently ignored.

---

## Database Schema

```
user_credits          unlocked_tickers         credit_purchases
┌──────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│ user_id (PK) │     │ id (PK)          │     │ id (PK)              │
│ total        │     │ user_id (FK)     │     │ user_id (FK)         │
│ used         │     │ ticker           │     │ stripe_session_id (U)│
│ created_at   │     │ unlocked_at      │     │ pack_key             │
│ updated_at   │     │ UNIQUE(user,tick)│     │ credits_purchased    │
└──────────────┘     └──────────────────┘     │ amount_cents         │
                                               └──────────────────────┘
```

All tables have RLS enabled. Users can only read/write their own rows. Writes to `credit_purchases` happen via service role (webhook handler).

---

## API Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/credits/access?ticker=X` | Optional | Lightweight check: free / unlocked / login_required / credit_required |
| POST | `/api/credits/unlock` | Required | Spend 1 credit to unlock a ticker. Body: `{ ticker }` |
| GET | `/api/credits/status` | Required | Balance + list of unlocked tickers |
| POST | `/api/stripe/checkout` | Required | Create Stripe Checkout session. Body: `{ pack: "starter_30" }` |
| POST | `/api/stripe/webhook` | Stripe sig | Fulfills credits after payment |

### MCP / REST API Gating

Both `/api/valuation/[ticker]` and MCP `get_stock_valuation` tool check credits:
- Free tickers → always allowed (no auth needed)
- Others → require `Authorization: Bearer <jwt>` + ticker must be unlocked
- Existing MCP rate limit (30 RPM) is unchanged

---

## Auth

- **Providers**: Google OAuth (primary) + email/password (fallback)
- **Google OAuth setup**: Google Cloud Console OAuth client → Supabase Dashboard → Providers → Google
- **Cookie persistence**: Auth callback uses `@supabase/ssr` `createServerClient` with cookie read/write (`src/lib/auth/supabase-auth-server.ts`)
- **Important**: This file is separate from `supabase-auth.ts` because `next/headers` cannot be imported in client components

### Local Stripe Webhook Testing

Stripe can't reach localhost. Use Stripe CLI:

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Copy the whsec_... secret to .env.local as STRIPE_WEBHOOK_SECRET
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/constants.ts` | `FREE_TICKERS`, `CREDIT_PACKS`, `CreditPackKey` |
| `src/lib/credits.ts` | Credit service: check, unlock, add |
| `src/lib/auth/supabase-auth-server.ts` | Cookie-aware Supabase client (server only) |
| `src/components/paywall/access-gate.tsx` | Client-side gate (no CLS) |
| `src/components/paywall/ticker-paywall.tsx` | Paywall overlay UI |
| `src/components/layout/user-menu.tsx` | Header dropdown with credit balance |
| `src/app/api/credits/` | 3 API routes |
| `src/app/api/stripe/checkout/route.ts` | One-time Stripe payment |
| `src/app/api/stripe/webhook/route.ts` | Credit fulfillment |
| `src/app/pricing/` | Pricing page + client components |

---

## Behaviors

- **Auto-watchlist**: Unlocking a ticker auto-adds it to the user's watchlist (best-effort)
- **Unlock is permanent**: No expiration, no revocation
- **Credits never expire**: `total - used = remaining`, no time component
- **Free list changes**: If a ticker is removed from `FREE_TICKERS`, users who never unlocked it lose free access. Already-unlocked users are unaffected.
