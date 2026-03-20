"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SummaryCard } from "@/components/valuation/summary-card";
import { ModelCard } from "@/components/valuation/model-card";
import { WACCCard } from "@/components/valuation/wacc-card";
import { PriceValueChart } from "@/components/charts/price-value-chart";
import { AddToWatchlistButton } from "@/components/watchlist/add-to-watchlist-button";
import type { ValuationSummary, Company, ModelApplicability } from "@/types";

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
  const { classification } = summary;

  // Build applicability map
  const applicabilityMap = new Map<string, ModelApplicability>(
    classification.model_applicability.map((a) => [a.model_type, a])
  );

  // Group models by role
  const primaryModels = summary.models.filter((m) => {
    const app = applicabilityMap.get(m.model_type);
    return app?.role === "primary" && m.fair_value > 0;
  });

  const crossCheckModels = summary.models.filter((m) => {
    const app = applicabilityMap.get(m.model_type);
    return app?.role === "cross_check" && m.fair_value > 0;
  });

  const sanityCheckModels = summary.models.filter((m) => {
    const app = applicabilityMap.get(m.model_type);
    return (app?.role === "sanity_check" && m.fair_value > 0) ||
      (!app && m.fair_value > 0);
  });

  const naModels = summary.models.filter((m) => m.fair_value === 0);

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

      {/* ========================================= */}
      {/* Step 1: Classification + Verdict + Football Field */}
      {/* ========================================= */}
      <SummaryCard summary={summary} />

      {/* Price vs Intrinsic Value Chart */}
      <div className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">
          Stock Price vs Intrinsic Value
        </h2>
        <PriceValueChart ticker={ticker} />
      </div>

      <Separator className="my-10" />

      {/* ========================================= */}
      {/* Step 2: WACC — Foundation of DCF */}
      {/* ========================================= */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-2">
          Step 1: Cost of Capital (WACC)
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          The discount rate used in DCF models. A higher WACC means future cash flows are worth less today.
        </p>
        <div className="max-w-lg">
          <WACCCard wacc={summary.wacc} />
        </div>
      </section>

      <Separator className="my-10" />

      {/* ========================================= */}
      {/* Step 3: Primary Models */}
      {/* ========================================= */}
      {primaryModels.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-2">
            Step 2: Primary Valuation Models
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            The models most suited to this company&apos;s profile ({classification.label}).
            These carry the highest weight in our consensus estimate.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {primaryModels.map((model) => (
              <ModelCard
                key={model.model_type}
                model={model}
                currentPrice={summary.current_price}
                applicability={applicabilityMap.get(model.model_type)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ========================================= */}
      {/* Step 4: Cross-Check Models */}
      {/* ========================================= */}
      {crossCheckModels.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-2">
            Step 3: Cross-Check Models
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Alternative approaches to validate primary model results. Agreement across methods increases conviction.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {crossCheckModels.map((model) => (
              <ModelCard
                key={model.model_type}
                model={model}
                currentPrice={summary.current_price}
                applicability={applicabilityMap.get(model.model_type)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ========================================= */}
      {/* Step 5: Sanity Checks */}
      {/* ========================================= */}
      {sanityCheckModels.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-2">
            Step 4: Sanity Checks
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Quick-reference models for directional validation. Lower weight in the consensus but useful as guardrails.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            {sanityCheckModels.map((model) => (
              <ModelCard
                key={model.model_type}
                model={model}
                currentPrice={summary.current_price}
                applicability={applicabilityMap.get(model.model_type)}
              />
            ))}
          </div>
        </section>
      )}

      {/* N/A models (collapsed) */}
      {naModels.length > 0 && (
        <section className="mb-10">
          <details>
            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
              {naModels.length} model{naModels.length > 1 ? "s" : ""} not applicable for this company
            </summary>
            <div className="grid gap-4 lg:grid-cols-2 mt-4">
              {naModels.map((model) => (
                <ModelCard
                  key={model.model_type}
                  model={model}
                  currentPrice={summary.current_price}
                  applicability={applicabilityMap.get(model.model_type)}
                />
              ))}
            </div>
          </details>
        </section>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground border-t pt-6 mt-10">
        <p className="mb-2">
          <strong>Methodology note:</strong> Model weights are dynamically assigned based on
          company archetype ({classification.label}). The consensus value is a weighted average
          across all applicable models. Individual model confidence levels reflect how well each
          approach fits this specific company&apos;s financial profile.
        </p>
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
