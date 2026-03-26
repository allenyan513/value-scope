import { TickerSearch } from "@/components/ticker-search";
import { BarChart3, Eye, Shield, Zap } from "lucide-react";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ValuScope",
  url: "https://valuscope.com",
  description:
    "Free stock intrinsic value calculator. DCF, Trading Multiples, PEG models with transparent assumptions.",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://valuscope.com/{ticker}",
    "query-input": "required name=ticker",
  },
};

const features = [
  {
    icon: Zap,
    title: "Faster Than Morningstar",
    desc: "Valuations update daily, not monthly. You see fresh numbers every morning.",
  },
  {
    icon: Eye,
    title: "Fully Transparent",
    desc: "Every assumption is visible. Revenue growth, WACC, margins — nothing is hidden.",
  },
  {
    icon: BarChart3,
    title: "7 Models, One Summary",
    desc: "DCF (4 variants), P/E, EV/EBITDA, PEG — all in one page with a clear verdict.",
  },
  {
    icon: Shield,
    title: "Free for S&P 500",
    desc: "Full valuation for all S&P 500 companies. No credit card required.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <section className="relative py-24 sm:py-36 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand/[0.04] via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground mb-8 shadow-sm">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Free for all S&P 500 stocks
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
            Know What a Stock Is{" "}
            <span className="text-brand">Really Worth</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            7 valuation models. Transparent assumptions. Updated daily.
          </p>
          <div className="max-w-lg mx-auto">
            <TickerSearch large />
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Try AAPL, MSFT, GOOGL, NVDA, TSLA...
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 border-y bg-card/50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-4">
            How ValuScope Works
          </h2>
          <p className="text-muted-foreground text-center mb-14 max-w-lg mx-auto">
            From raw financial data to a clear valuation verdict in seconds.
          </p>
          <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: "1",
                title: "Real Financial Data",
                desc: "We pull 5+ years of financial statements, analyst estimates, and market data directly from SEC filings.",
              },
              {
                step: "2",
                title: "7 Valuation Models",
                desc: "DCF, Trading Multiples, PEG — each model with fully transparent assumptions you can inspect.",
              },
              {
                step: "3",
                title: "Clear Verdict",
                desc: "See if a stock is undervalued, overvalued, or fairly priced — with a price-vs-value chart showing the full picture.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center group">
                <div className="w-12 h-12 rounded-xl bg-brand/10 text-brand flex items-center justify-center mx-auto mb-4 font-bold text-lg group-hover:bg-brand group-hover:text-brand-foreground transition-colors">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-4">
            Why ValuScope?
          </h2>
          <p className="text-muted-foreground text-center mb-14 max-w-lg mx-auto">
            Built for investors who care about the numbers behind the price.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {features.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border bg-card p-6 hover:shadow-md hover:border-brand/20 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center mb-4 group-hover:bg-brand group-hover:text-brand-foreground transition-colors">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t bg-card/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Start Valuing Stocks Today
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            No sign-up required. Search any S&P 500 stock and get a full valuation instantly.
          </p>
          <div className="max-w-md mx-auto">
            <TickerSearch large />
          </div>
        </div>
      </section>
    </div>
  );
}
