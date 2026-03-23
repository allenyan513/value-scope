import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/db/supabase";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: authHeader ? { Authorization: authHeader } : {} } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServerClient();
  const { data: sub } = await db
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 404 }
    );
  }

  const baseUrl = request.headers.get("origin") || "https://valuscope.com";

  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${baseUrl}/pricing`,
  });

  return NextResponse.json({ url: session.url });
}
