"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SummaryCard } from "@/components/valuation/summary-card";
import { ModelCard } from "@/components/valuation/model-card";
import { WACCCard } from "@/components/valuation/wacc-card";
import { PriceValueChart } from "@/components/charts/price-value-chart";
import { AddToWatchlistButton } from "@/components/watchlist/add-to-watchlist-button";
import type { ValuationSummary, Company } from "@/types";

interface Props {
  summary: ValuationSummary;
  company: Company;
  ticker: string;
}

function formatMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export function StockValuationClient({ summary, company, ticker }: Props) {
  // Group models
  const dcfModels = summary.models.filter((m) =>
    m.model_type.startsWith("dcf_")
  );
  const multiplesModels = summary.models.filter(
    (m) => m.model_type === "pe_multiples" || m.model_type === "ev_ebitda_multiples"
  );
  const otherModels = summary.models.filter(
    (m) => m.model_type === "peter_lynch"
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Company Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{company.name}</h1>
            <Badge variant="outline" className="font-mono text-base">
              {ticker}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{company.sector}</span>
            <span>{company.industry}</span>
            <span>{company.exchange}</span>
            <AddToWatchlistButton ticker={ticker} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">
            ${summary.current_price.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground">
            Market Cap: {formatMarketCap(company.market_cap)}
          </div>
        </div>
      </div>

      {/* Valuation Summary */}
      <SummaryCard summary={summary} />

      {/* Price vs Intrinsic Value Chart */}
      <div className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">
          Stock Price vs Intrinsic Value
        </h2>
        <PriceValueChart ticker={ticker} />
      </div>

      <Separator className="my-10" />

      {/* DCF Models */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">
          Discounted Cash Flow (DCF) Models
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {dcfModels.map((model) => (
            <ModelCard
              key={model.model_type}
              model={model}
              currentPrice={summary.current_price}
            />
          ))}
        </div>
      </section>

      {/* Trading Multiples */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">Trading Multiples</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {multiplesModels.map((model) => (
            <ModelCard
              key={model.model_type}
              model={model}
              currentPrice={summary.current_price}
            />
          ))}
        </div>
      </section>

      {/* Other Models */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">Other Valuation Models</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {otherModels.map((model) => (
            <ModelCard
              key={model.model_type}
              model={model}
              currentPrice={summary.current_price}
            />
          ))}
        </div>
      </section>

      {/* WACC */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">
          Cost of Capital
        </h2>
        <div className="max-w-lg">
          <WACCCard wacc={summary.wacc} />
        </div>
      </section>

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground border-t pt-6 mt-10">
        <p>
          <strong>Disclaimer:</strong> ValuScope provides estimated intrinsic values for
          informational purposes only. This is not financial advice. All models rely on
          assumptions that may not reflect future performance. Always do your own research
          before making investment decisions. Data sourced from SEC filings via Financial
          Modeling Prep. Last updated: {new Date(summary.computed_at).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}
