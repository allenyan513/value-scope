"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationSummary } from "@/types";

const MODEL_NAMES: Record<string, string> = {
  dcf_growth_exit_5y: "DCF (Growth Exit 5Y)",
  dcf_growth_exit_10y: "DCF (Growth Exit 10Y)",
  dcf_ebitda_exit_5y: "DCF (EBITDA Exit 5Y)",
  dcf_ebitda_exit_10y: "DCF (EBITDA Exit 10Y)",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peter_lynch: "Peter Lynch Fair Value",
};

const VERDICT_CONFIG = {
  undervalued: { badge: "default" as const, label: "Undervalued", color: "text-green-600" },
  fairly_valued: { badge: "secondary" as const, label: "Fairly Valued", color: "text-gray-600" },
  overvalued: { badge: "destructive" as const, label: "Overvalued", color: "text-red-500" },
};

interface Props {
  summary: ValuationSummary;
}

export function SummaryCard({ summary }: Props) {
  const verdict = VERDICT_CONFIG[summary.verdict];
  const applicableModels = summary.models.filter((m) => m.fair_value > 0);
  const primaryModel = summary.models.find(
    (m) => m.model_type === "dcf_growth_exit_5y"
  );

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-6">Valuation Summary</h2>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: SEO copy */}
        <div className="lg:w-2/5 space-y-6">
          {/* Intrinsic value */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              What is the intrinsic value of {summary.company_name}?
            </h3>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-3xl font-bold">
                ${summary.primary_fair_value.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">USD</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Based on the Discounted Cash Flows (Growth Exit 5Y) model.
              {primaryModel && (
                <> The range is ${primaryModel.low_estimate.toFixed(2)} – ${primaryModel.high_estimate.toFixed(2)} USD.</>
              )}
            </p>
          </div>

          {/* Verdict */}
          <div className="border-t pt-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Is {summary.company_name} undervalued or overvalued?
            </h3>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant={verdict.badge}>{verdict.label}</Badge>
              <span className={`text-xl font-bold ${verdict.color}`}>
                {summary.primary_upside > 0 ? "+" : ""}
                {summary.primary_upside.toFixed(1)}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {summary.verdict_text}
            </p>
          </div>
        </div>

        {/* Right: Models table */}
        <div className="lg:w-3/5 lg:border-l lg:pl-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-orange-400">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground" />
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Range</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Selected</th>
                  <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Upside</th>
                </tr>
              </thead>
              <tbody>
                {applicableModels.map((m) => (
                  <tr key={m.model_type} className="border-b border-muted/30">
                    <td className="py-2.5 pr-4 font-medium whitespace-nowrap">
                      {MODEL_NAMES[m.model_type] ?? m.model_type}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {m.low_estimate.toFixed(2)} - {m.high_estimate.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-medium">
                      {m.fair_value.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 pl-4 text-right font-mono font-semibold whitespace-nowrap ${
                        m.upside_percent > 0
                          ? "text-green-600"
                          : m.upside_percent < 0
                            ? "text-red-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      {m.upside_percent > 0 ? "+" : ""}
                      {m.upside_percent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}
