import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { CREDIT_PACKS, type CreditPackKey } from "@/lib/constants";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = await request.json();
  const packKey = body.pack as CreditPackKey;

  if (!packKey || !(packKey in CREDIT_PACKS)) {
    return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  const pack = CREDIT_PACKS[packKey];
  const baseUrl = request.headers.get("origin") || "https://valuescope.dev";

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: {
            name: `ValuScope ${pack.label} — ${pack.credits} Credits`,
            description: `Permanently unlock ${pack.credits} stocks at ${pack.perStock}/stock`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: user.id,
      pack_key: packKey,
    },
    success_url: `${baseUrl}/pricing?success=true`,
    cancel_url: `${baseUrl}/pricing?canceled=true`,
  });

  return NextResponse.json({ url: session.url });
}
