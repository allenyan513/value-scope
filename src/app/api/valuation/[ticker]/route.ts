// ============================================================
// GET /api/valuation/[ticker]
// Compute valuation for a stock on demand
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { computeValuationForTicker, ValuationError } from "@/mcp/valuation-handler";
import { isFreeTicker, hasTickerAccess } from "@/lib/credits";
import { createSupabaseWithAuth } from "@/lib/api/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Credit gate: non-free tickers require auth + unlock
  if (!isFreeTicker(upperTicker)) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json(
        { error: "Authentication required for non-free tickers", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const supabase = createSupabaseWithAuth(request);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Invalid authentication token", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const access = await hasTickerAccess(user.id, upperTicker);
    if (!access) {
      return NextResponse.json(
        { error: "Credit required to access this ticker", code: "CREDIT_REQUIRED" },
        { status: 403 }
      );
    }
  }

  try {
    const { summary } = await computeValuationForTicker(upperTicker);

    // Bust ISR cache so page reflects fresh valuation
    revalidatePath(`/${upperTicker}`, "layout");

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof ValuationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error(`Valuation error for ${upperTicker}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
