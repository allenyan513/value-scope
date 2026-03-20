// GET /api/search?q=AAPL
import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  if (query.length < 1) {
    return NextResponse.json([]);
  }
  const results = await searchCompanies(query, 8);
  return NextResponse.json(results);
}
