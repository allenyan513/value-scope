// ============================================================
// Credit System — check access, unlock tickers, manage balance
// All DB operations use service role client (not user's RLS client)
// because webhook handler runs without user session and
// unlock_ticker needs atomic PG function calls.
// ============================================================

import { createServerClient } from "@/lib/db/supabase";
import { FREE_TICKERS, CREDIT_PACKS, type CreditPackKey } from "./constants";

// ---- Pure helpers (no DB) ----

/** Check if a ticker is in the free-for-all list */
export function isFreeTicker(ticker: string): boolean {
  return FREE_TICKERS.has(ticker.toUpperCase());
}

// ---- Types ----

export interface CreditBalance {
  total: number;
  used: number;
  remaining: number;
}

export interface AccessCheckResult {
  access: boolean;
  reason: "free" | "unlocked" | "login_required" | "credit_required";
  remaining?: number;
}

// ---- DB read operations ----

/** Get user's credit balance. Returns zeros if no row exists. */
export async function getUserCredits(userId: string): Promise<CreditBalance> {
  const db = createServerClient();
  const { data } = await db
    .from("user_credits")
    .select("total, used")
    .eq("user_id", userId)
    .single();

  if (!data) return { total: 0, used: 0, remaining: 0 };
  return { total: data.total, used: data.used, remaining: data.total - data.used };
}

/** Get list of tickers unlocked by a user */
export async function getUnlockedTickers(userId: string): Promise<string[]> {
  const db = createServerClient();
  const { data } = await db
    .from("unlocked_tickers")
    .select("ticker")
    .eq("user_id", userId);
  return (data ?? []).map((row: { ticker: string }) => row.ticker);
}

/** Check if user can access a specific ticker (free list OR unlocked) */
export async function hasTickerAccess(userId: string | null, ticker: string): Promise<boolean> {
  const upper = ticker.toUpperCase();
  if (isFreeTicker(upper)) return true;
  if (!userId) return false;

  const db = createServerClient();
  const { data } = await db
    .from("unlocked_tickers")
    .select("id")
    .eq("user_id", userId)
    .eq("ticker", upper)
    .limit(1)
    .maybeSingle();

  return !!data;
}

/** Full access check with reason — used by /api/credits/access endpoint */
export async function checkTickerAccess(
  userId: string | null,
  ticker: string
): Promise<AccessCheckResult> {
  const upper = ticker.toUpperCase();

  if (isFreeTicker(upper)) {
    return { access: true, reason: "free" };
  }

  if (!userId) {
    return { access: false, reason: "login_required" };
  }

  // Parallel: check unlock status + credit balance
  const [unlocked, balance] = await Promise.all([
    hasTickerAccess(userId, upper),
    getUserCredits(userId),
  ]);

  if (unlocked) {
    return { access: true, reason: "unlocked" };
  }

  return { access: false, reason: "credit_required", remaining: balance.remaining };
}

// ---- DB write operations ----

/**
 * Unlock a ticker for a user. Uses atomic PG function:
 * deducts 1 credit + inserts unlock row in one transaction.
 */
export async function unlockTicker(
  userId: string,
  ticker: string
): Promise<{ success: true; remaining: number } | { success: false; error: string }> {
  const upper = ticker.toUpperCase();

  if (isFreeTicker(upper)) {
    return { success: false, error: "This stock is free — no credit needed" };
  }

  const db = createServerClient();

  const { data, error } = await db.rpc("unlock_ticker", {
    p_user_id: userId,
    p_ticker: upper,
  });

  if (error) {
    // Parse PG exception messages
    if (error.message.includes("Insufficient credits")) {
      return { success: false, error: "No credits remaining" };
    }
    if (error.message.includes("already unlocked")) {
      return { success: false, error: "Already unlocked" };
    }
    return { success: false, error: error.message };
  }

  // Auto-add to watchlist (best-effort, don't fail the unlock if this errors)
  await db
    .from("watchlists")
    .upsert({ user_id: userId, ticker: upper }, { onConflict: "user_id,ticker" })
    .then(() => {})
    .catch(() => {});

  return { success: true, remaining: data.remaining };
}

/**
 * Add credits after Stripe payment. Called from webhook handler.
 * Idempotent: uses stripe_session_id as unique key.
 */
export async function addCredits(params: {
  userId: string;
  packKey: CreditPackKey;
  stripeSessionId: string;
  stripeCustomerId: string | null;
}): Promise<void> {
  const { userId, packKey, stripeSessionId, stripeCustomerId } = params;
  const pack = CREDIT_PACKS[packKey];
  if (!pack) throw new Error(`Unknown pack: ${packKey}`);

  const db = createServerClient();

  // Insert purchase record (idempotent via UNIQUE stripe_session_id)
  const { error: purchaseError } = await db.from("credit_purchases").insert({
    user_id: userId,
    stripe_session_id: stripeSessionId,
    stripe_customer_id: stripeCustomerId,
    pack_key: packKey,
    credits_purchased: pack.credits,
    amount_cents: pack.priceCents,
  });

  if (purchaseError) {
    // 23505 = unique_violation → already processed (idempotent)
    if (purchaseError.code === "23505") return;
    throw purchaseError;
  }

  // Upsert user_credits: add to total
  const { error: creditError } = await db.rpc("add_user_credits", {
    p_user_id: userId,
    p_credits: pack.credits,
  });

  if (creditError) throw creditError;
}
