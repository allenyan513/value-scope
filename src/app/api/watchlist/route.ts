import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseWithAuth(authHeader: string | null) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  );
  return supabase;
}

// GET /api/watchlist — list user's watchlist
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const supabase = getSupabaseWithAuth(authHeader);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: watchlistItems } = await supabase
    .from("watchlists")
    .select("ticker, added_at")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (!watchlistItems || watchlistItems.length === 0) {
    return NextResponse.json([]);
  }

  // Enrich with company data and latest valuation
  const tickers = watchlistItems.map((w) => w.ticker);
  const { data: companies } = await supabase
    .from("companies")
    .select("ticker, name, price, market_cap")
    .in("ticker", tickers);

  const { data: valuations } = await supabase
    .from("valuations")
    .select("ticker, fair_value, upside_percent")
    .in("ticker", tickers)
    .eq("model_type", "dcf_growth_exit_5y");

  const companyMap = new Map(
    (companies ?? []).map((c) => [c.ticker, c])
  );
  const valMap = new Map(
    (valuations ?? []).map((v) => [v.ticker, v])
  );

  const enriched = watchlistItems.map((w) => {
    const company = companyMap.get(w.ticker);
    const val = valMap.get(w.ticker);
    return {
      ticker: w.ticker,
      company_name: company?.name ?? w.ticker,
      current_price: company?.price ?? 0,
      fair_value: val?.fair_value ?? 0,
      upside_percent: val?.upside_percent ?? 0,
      added_at: w.added_at,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/watchlist — add ticker to watchlist
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const supabase = getSupabaseWithAuth(authHeader);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const authHeader = request.headers.get("authorization");
  const supabase = getSupabaseWithAuth(authHeader);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
