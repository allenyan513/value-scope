// GET /api/history/[ticker]?days=1825
// Returns price vs intrinsic value history for chart
import { NextRequest, NextResponse } from "next/server";
import { getValuationHistory } from "@/lib/db/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const days = parseInt(request.nextUrl.searchParams.get("days") || "1825");
  const history = await getValuationHistory(ticker.toUpperCase(), days);
  return NextResponse.json(history);
}
