// ============================================================
// GET /api/credits/access?ticker=MSFT
// Lightweight access check — used by <AccessGate> client component.
// No auth required (returns "login_required" for anonymous users).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseWithAuth } from "@/lib/api/auth";
import { checkTickerAccess } from "@/lib/credits";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  // Try to get user from auth header (optional)
  let userId: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const supabase = createSupabaseWithAuth(request);
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  const result = await checkTickerAccess(userId, ticker);
  return NextResponse.json(result);
}
