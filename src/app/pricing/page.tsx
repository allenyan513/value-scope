import { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Check, Coins } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/constants";
import { PricingBuyButton } from "./pricing-buy-button";
import { CreditBalance } from "./credit-balance";

export const metadata: Metadata = {
  title: "Pricing — Buy Credits to Unlock Stocks | ValuScope",
  description:
    "Unlock stock valuations with credits. Each credit permanently unlocks one stock. 5 popular stocks are free. Starting at $9 for 5 stocks.",
};

const packs: Array<{
  key: "trial_5" | "starter_30" | "pro_500";
  credits: number;
  priceCents: number;
  label: string;
  perStock: string;
  description: string;
  features: string[];
  highlighted: boolean;
  badge?: string;
}> = [
  {
    key: "trial_5",
    ...CREDIT_PACKS.trial_5,
    description: "Try it out with 5 stocks",
    features: [
      "5 stock unlocks",
      "All 9 valuation models",
      "Permanent access",
      "Daily data updates",
    ],
    highlighted: false,
  },
  {
    key: "starter_30",
    ...CREDIT_PACKS.starter_30,
    description: "Best value for active investors",
    features: [
      "30 stock unlocks",
      "All 9 valuation models",
      "Permanent access",
      "Daily data updates",
      "MCP & API access",
    ],
    highlighted: true,
    badge: "Popular",
  },
  {
    key: "pro_500",
    ...CREDIT_PACKS.pro_500,
    description: "For professionals and quant teams",
    features: [
      "500 stock unlocks",
      "All 9 valuation models",
      "Permanent access",
      "Daily data updates",
      "MCP & API access",
      "Priority support",
    ],
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="container mx-auto px-4 py-20">
      <div className="text-center mb-14">
        <h1 className="text-4xl font-bold mb-4 tracking-tight">
          Buy Credits, Unlock Stocks
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Each credit permanently unlocks full valuation analysis for one stock.
          5 popular stocks (AAPL, NVDA, MSFT, GOOGL, AMZN) are{" "}
          <span className="font-semibold text-foreground">free for everyone</span>.
        </p>
      </div>

      {/* Credit balance (only shows when logged in) */}
      <CreditBalance />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {packs.map((pack) => (
          <div
            key={pack.key}
            className={`rounded-xl border bg-card p-8 flex flex-col transition-all ${
              pack.highlighted
                ? "border-brand shadow-lg shadow-brand/10 relative ring-1 ring-brand/20"
                : "hover:shadow-md hover:border-brand/20"
            }`}
          >
            {pack.badge && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand text-brand-foreground hover:bg-brand/90">
                {pack.badge}
              </Badge>
            )}
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2">{pack.label}</h2>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">
                  ${(pack.priceCents / 100).toFixed(0)}
                </span>
                <span className="text-muted-foreground">one-time</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Coins className="h-4 w-4 text-brand" />
                <span className="text-sm font-medium">
                  {pack.credits} stocks at {pack.perStock} each
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {pack.description}
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {pack.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-brand mt-0.5 shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <PricingBuyButton
              packKey={pack.key}
              label={pack.label}
              highlighted={pack.highlighted}
            />
          </div>
        ))}
      </div>

      <div className="text-center mt-14 text-sm text-muted-foreground space-y-2">
        <p>
          Credits never expire. Once a stock is unlocked, it stays unlocked forever.
        </p>
        <p>
          <Link href="/" className="text-brand hover:underline font-medium">
            Try free stocks
          </Link>{" "}
          — AAPL, NVDA, MSFT, GOOGL, and AMZN — no account required.
        </p>
      </div>
    </div>
  );
}
