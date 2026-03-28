// ============================================================
// GET /api/credits/status
// Returns user's credit balance and unlocked tickers list.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { getUserCredits, getUnlockedTickers } from "@/lib/credits";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const [balance, tickers] = await Promise.all([
    getUserCredits(user.id),
    getUnlockedTickers(user.id),
  ]);

  return NextResponse.json({
    ...balance,
    unlocked_tickers: tickers,
  });
}
