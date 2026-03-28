import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";

// GET /api/watchlist — list user's watchlist
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data: watchlistItems } = await supabase
    .from("watchlists")
    .select("ticker, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (!watchlistItems || watchlistItems.length === 0) {
    return NextResponse.json([]);
  }

  // Enrich with company data
  const tickers = watchlistItems.map((w) => w.ticker);
  const { data: companies } = await supabase
    .from("companies")
    .select("ticker, name, price, market_cap")
    .in("ticker", tickers);

  const companyMap = new Map(
    (companies ?? []).map((c) => [c.ticker, c])
  );

  const enriched = watchlistItems.map((w) => {
    const company = companyMap.get(w.ticker);
    return {
      ticker: w.ticker,
      company_name: company?.name ?? w.ticker,
      current_price: company?.price ?? 0,
      added_at: w.added_at,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/watchlist — add ticker to watchlist
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const body = await request.json();
  const ticker = (body.ticker as string)?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  const { error } = await supabase.from("watchlists").upsert(
    { user_id: user.id, ticker },
    { onConflict: "user_id,ticker" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ticker });
}

// DELETE /api/watchlist — remove ticker from watchlist
export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json({ error: "Ticker is required" }, { status: 400 });
  }

  await supabase
    .from("watchlists")
    .delete()
    .eq("user_id", user.id)
    .eq("ticker", ticker);

  return NextResponse.json({ ok: true, ticker });
}
