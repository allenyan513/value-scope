import { TickerSearch } from "@/components/ticker-search";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ValuScope",
  url: "https://valuscope.com",
  description:
    "Free stock intrinsic value calculator. DCF, Trading Multiples, Peter Lynch models with transparent assumptions.",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://valuscope.com/{ticker}",
    "query-input": "required name=ticker",
  },
};

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero Section */}
      <section className="py-20 sm:py-32">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6">
            Know What a Stock Is{" "}
            <span className="text-primary">Really Worth</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            7 valuation models. Transparent assumptions. Updated daily.
            Free for S&amp;P 500 stocks.
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
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-12">
            How ValuScope Works
          </h2>
          <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                1
              </div>
              <h3 className="font-semibold mb-2">Real Financial Data</h3>
              <p className="text-sm text-muted-foreground">
                We pull 5+ years of financial statements, analyst estimates, and
                market data directly from SEC filings.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                2
              </div>
              <h3 className="font-semibold mb-2">7 Valuation Models</h3>
              <p className="text-sm text-muted-foreground">
                DCF, Trading Multiples, Peter Lynch &mdash; each model with
                fully transparent assumptions you can inspect.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                3
              </div>
              <h3 className="font-semibold mb-2">Clear Verdict</h3>
              <p className="text-sm text-muted-foreground">
                See if a stock is undervalued, overvalued, or fairly priced
                &mdash; with a price-vs-value chart showing the full picture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-12">
            Why ValuScope?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                title: "Faster Than Morningstar",
                desc: "Valuations update daily, not monthly. You see fresh numbers every morning.",
              },
              {
                title: "Fully Transparent",
                desc: "Every assumption is visible. Revenue growth, WACC, margins — nothing is hidden.",
              },
              {
                title: "7 Models, One Summary",
                desc: "DCF (4 variants), P/E, EV/EBITDA, Peter Lynch — all in one page with a clear verdict.",
              },
              {
                title: "Free for S&P 500",
                desc: "Full valuation for all S&P 500 companies. No credit card required.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border p-6 hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
