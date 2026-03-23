import { NextRequest, NextResponse } from "next/server";
import { getStripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

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

  const body = await request.json();
  const plan = body.plan as PlanKey;

  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const baseUrl = request.headers.get("origin") || "https://valuscope.com";

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        price: PLANS[plan].priceId,
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/pricing?success=true`,
    cancel_url: `${baseUrl}/pricing?canceled=true`,
    metadata: {
      user_id: user.id,
      plan,
    },
  });

  return NextResponse.json({ url: session.url });
}
