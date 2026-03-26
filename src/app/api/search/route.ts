// GET /api/search?q=AAPL
import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/db/queries";
import { getCompanyProfile } from "@/lib/data/fmp";
import { TICKER_REGEX } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  if (query.length < 1) {
    return NextResponse.json([]);
  }

  // Primary: search local DB (fast)
  const dbResults = await searchCompanies(query, 8);

  // If DB has enough results, return immediately
  if (dbResults.length >= 3) {
    return NextResponse.json(dbResults);
  }

  // Fallback: try FMP profile lookup if query looks like a ticker (1-5 uppercase chars)
  const upperQuery = query.toUpperCase().trim();
  if (TICKER_REGEX.test(upperQuery)) {
    const dbTickers = new Set(dbResults.map((r) => r.ticker));
    if (!dbTickers.has(upperQuery)) {
      try {
        const profile = await getCompanyProfile(upperQuery);
        if (profile) {
          dbResults.push({ ticker: profile.symbol, name: profile.companyName });
        }
      } catch {
        // FMP lookup failed — return DB results only
      }
    }
  }

  return NextResponse.json(dbResults.slice(0, 8));
}
