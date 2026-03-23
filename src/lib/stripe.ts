import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

export const PLANS = {
  pro: {
    name: "Pro",
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    price: 1900, // $19/month in cents
  },
  api: {
    name: "API",
    priceId: process.env.STRIPE_API_PRICE_ID!,
    price: 4900, // $49/month in cents
  },
} as const;

export type PlanKey = keyof typeof PLANS;
