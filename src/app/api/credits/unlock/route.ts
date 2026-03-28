// ============================================================
// POST /api/credits/unlock
// Spend 1 credit to permanently unlock a ticker.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { unlockTicker, isFreeTicker } from "@/lib/credits";
import { getCompany } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await request.json();
  const ticker = (body.ticker as string)?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
  }

  // Free tickers don't need credits
  if (isFreeTicker(ticker)) {
    return NextResponse.json({ success: true, ticker, remaining: null, reason: "free" });
  }

  // Verify ticker exists in our database
  const company = await getCompany(ticker);
  if (!company) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }

  const result = await unlockTicker(user.id, ticker);

  if (!result.success) {
    // Map error messages to HTTP status codes
    const status = result.error === "No credits remaining" ? 402
      : result.error === "Already unlocked" ? 409
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true, ticker, remaining: result.remaining });
}
