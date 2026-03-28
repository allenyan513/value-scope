import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { addCredits } from "@/lib/credits";
import { type CreditPackKey } from "@/lib/constants";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook error: ${message}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const packKey = session.metadata?.pack_key as CreditPackKey | undefined;

    if (userId && packKey) {
      try {
        await addCredits({
          userId,
          packKey,
          stripeSessionId: session.id,
          stripeCustomerId: (session.customer as string) ?? null,
        });
        console.log(`[Stripe] Credits added: user=${userId} pack=${packKey}`);
      } catch (error) {
        console.error("[Stripe] Failed to add credits:", error);
        return NextResponse.json(
          { error: "Failed to process credits" },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
