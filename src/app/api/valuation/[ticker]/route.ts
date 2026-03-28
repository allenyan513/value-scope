// ============================================================
// GET /api/valuation/[ticker]
// Compute valuation for a stock on demand
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { computeValuationForTicker, ValuationError } from "@/mcp/valuation-handler";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

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
