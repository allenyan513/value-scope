import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServerClient } from "@/lib/db/supabase";
import { getAuthenticatedUser } from "@/lib/api/auth";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

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
