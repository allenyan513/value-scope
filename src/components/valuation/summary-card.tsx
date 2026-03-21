"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationSummary } from "@/types";
import { FootballFieldChart } from "./football-field-chart";

const VERDICT_STYLES = {
  undervalued: { bg: "bg-green-50 border-green-200", text: "text-green-700", badge: "default" as const, label: "Undervalued" },
  fairly_valued: { bg: "bg-gray-50 border-gray-200", text: "text-gray-700", badge: "secondary" as const, label: "Fairly Valued" },
  overvalued: { bg: "bg-red-50 border-red-200", text: "text-red-700", badge: "destructive" as const, label: "Overvalued" },
};

const ARCHETYPE_ICONS: Record<string, string> = {
  high_growth: "🚀",
  profitable_growth: "📈",
  mature_stable: "🏛️",
  dividend_payer: "💰",
  cyclical: "🔄",
  turnaround: "↩️",
  asset_heavy: "🏭",
  loss_making: "⚠️",
};

interface Props {
  summary: ValuationSummary;
}

export function SummaryCard({ summary }: Props) {
  const style = VERDICT_STYLES[summary.verdict];
  const { classification } = summary;
  const hasConsensus = summary.consensus_fair_value > 0;

  return (
    <div className="space-y-6">
      {/* Company Classification Banner */}
      <Card className="p-4 border-l-4 border-l-blue-500">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{ARCHETYPE_ICONS[classification.archetype] ?? "📊"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold">{classification.label}</span>
              <Badge variant="outline" className="text-[10px]">
                {summary.company_name}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {classification.description}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {classification.traits.map((trait) => (
                <span
                  key={trait}
                  className="inline-block px-2 py-0.5 rounded-full bg-muted text-[10px] text-muted-foreground"
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Main Verdict Card */}
      <Card className={`p-6 border ${style.bg}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm text-muted-foreground mb-1">
              {hasConsensus ? "Weighted Consensus Value" : "Intrinsic Value Estimate"}
            </h2>
            <div className="text-4xl font-bold">
              ${(hasConsensus ? summary.consensus_fair_value : summary.primary_fair_value).toFixed(2)}
            </div>
            {hasConsensus && (
              <div className="text-xs text-muted-foreground mt-1">
                Range: ${summary.consensus_low.toFixed(2)} — ${summary.consensus_high.toFixed(2)}
              </div>
            )}
            <div className="text-sm text-muted-foreground mt-1">
              Current price: ${summary.current_price.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <Badge variant={style.badge} className="text-base px-3 py-1">
              {(hasConsensus ? summary.consensus_upside : summary.primary_upside) > 0 ? "+" : ""}
              {(hasConsensus ? summary.consensus_upside : summary.primary_upside).toFixed(1)}%
            </Badge>
            <div className="mt-2">
              <Badge variant="outline" className="text-xs">
                {style.label}
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Based on {summary.models.filter(m => m.fair_value > 0).length} models
            </div>
          </div>
        </div>

        <p className={`text-sm ${style.text} mb-6`}>{summary.verdict_text}</p>

        {/* Football Field Chart */}
        <div>
          <h3 className="text-sm font-medium mb-3">Valuation Range by Model</h3>
          <FootballFieldChart
            models={summary.models}
            currentPrice={summary.current_price}
            consensusLow={summary.consensus_low}
            consensusHigh={summary.consensus_high}
            consensusFairValue={summary.consensus_fair_value}
            applicability={summary.classification.model_applicability}
          />
        </div>
      </Card>

      {/* Model Applicability Guide */}
      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Model Applicability for {summary.company_name}</h3>
        <div className="space-y-2">
          {classification.model_applicability
            .filter((a) => a.role !== "not_applicable")
            .sort((a, b) => {
              const order = { primary: 0, cross_check: 1, sanity_check: 2, not_applicable: 3 };
              return order[a.role] - order[b.role];
            })
            .map((app) => {
              // Find the model result to show its weight
              const modelResult = summary.models.find((m) => m.model_type === app.model_type);
              const weight = classification.model_weights[app.model_type] ?? 0;

              return (
                <div key={app.model_type} className="flex items-start gap-3 py-1.5">
                  <div className="shrink-0 mt-0.5">
                    {app.role === "primary" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    )}
                    {app.role === "cross_check" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
                    )}
                    {app.role === "sanity_check" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {MODEL_LABELS[app.model_type] ?? app.model_type}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          app.confidence === "high"
                            ? "border-green-300 text-green-700"
                            : app.confidence === "medium"
                              ? "border-amber-300 text-amber-700"
                              : "border-red-300 text-red-700"
                        }`}
                      >
                        {app.confidence} confidence
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {(weight * 100).toFixed(0)}% weight
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{app.reason}</p>
                    {modelResult && modelResult.fair_value > 0 && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        → ${modelResult.fair_value.toFixed(2)} ({modelResult.upside_percent > 0 ? "+" : ""}{modelResult.upside_percent.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

          {/* Show N/A models */}
          {classification.model_applicability.filter((a) => a.role === "not_applicable").length > 0 && (
            <div className="pt-2 border-t">
              <div className="text-[10px] text-muted-foreground">
                <span className="font-medium">Not applicable: </span>
                {classification.model_applicability
                  .filter((a) => a.role === "not_applicable")
                  .map((a) => `${MODEL_LABELS[a.model_type] ?? a.model_type} (${a.reason})`)
                  .join("; ")}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

const MODEL_LABELS: Record<string, string> = {
  dcf_growth_exit_5y: "DCF Growth Exit (5Y)",
  dcf_growth_exit_10y: "DCF Growth Exit (10Y)",
  dcf_ebitda_exit_5y: "DCF EBITDA Exit (5Y)",
  dcf_ebitda_exit_10y: "DCF EBITDA Exit (10Y)",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peter_lynch: "Peter Lynch",
};
