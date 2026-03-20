import { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pricing — Free for S&P 500",
  description:
    "ValuScope is free for all S&P 500 stocks. Upgrade to Pro for 8,000+ US stocks, custom assumptions, and API access.",
};

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Full valuation for S&P 500 stocks",
    features: [
      "All 7 valuation models",
      "S&P 500 stocks (500+ companies)",
      "Daily data updates",
      "Sensitivity analysis",
      "Price vs Intrinsic Value chart",
    ],
    cta: "Get Started",
    ctaHref: "/",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For serious investors who want more coverage",
    features: [
      "Everything in Free",
      "8,000+ US stocks",
      "Watchlist with alerts",
      "Custom WACC & growth assumptions",
      "CSV / PDF export",
      "Priority data updates",
    ],
    cta: "Coming Soon",
    ctaHref: "#",
    highlighted: true,
    badge: "Popular",
  },
  {
    name: "API",
    price: "$49",
    period: "/month",
    description: "Programmatic access for quant teams",
    features: [
      "Everything in Pro",
      "REST API access",
      "1,000 requests/day",
      "Bulk valuation endpoints",
      "Webhook notifications",
      "Dedicated support",
    ],
    cta: "Coming Soon",
    ctaHref: "#",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Start free with full access to S&P 500 valuations. Upgrade when you
          need broader coverage.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-lg border p-8 flex flex-col ${
              plan.highlighted
                ? "border-primary shadow-lg relative"
                : ""
            }`}
          >
            {plan.badge && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                {plan.badge}
              </Badge>
            )}
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2">{plan.name}</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {plan.description}
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <svg
                    className="w-4 h-4 text-primary mt-0.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.ctaHref === "#" ? (
              <Button
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                disabled
              >
                {plan.cta}
              </Button>
            ) : (
              <Link href={plan.ctaHref}>
                <Button
                  variant={plan.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {plan.cta}
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="text-center mt-12 text-sm text-muted-foreground">
        <p>
          Pro and API plans are coming soon.{" "}
          <Link href="/" className="underline hover:text-foreground">
            Start free
          </Link>{" "}
          today with full S&P 500 coverage.
        </p>
      </div>
    </div>
  );
}
