"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationSummary } from "@/types";

const MODEL_NAMES: Record<string, string> = {
  dcf_3stage: "DCF (Perpetual Growth)",
  dcf_pe_exit_10y: "DCF (P/E Exit 10Y)",
  dcf_ebitda_exit_fcfe_10y: "DCF (EV/EBITDA Exit 10Y)",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peter_lynch: "Peter Lynch Fair Value",
};

const MODEL_LINKS: Record<string, string> = {
  dcf_3stage: "/valuation/dcf/perpetual-growth",
  dcf_pe_exit_10y: "/valuation/dcf/pe-exit",
  dcf_ebitda_exit_fcfe_10y: "/valuation/dcf/ev-ebitda-exit",
  pe_multiples: "/valuation/relative/pe-multiples",
  ev_ebitda_multiples: "/valuation/relative/ev-ebitda-multiples",
  peter_lynch: "/valuation/peter-lynch",
};

const VERDICT_CONFIG = {
  undervalued: { badge: "default" as const, label: "Undervalued", color: "text-success" },
  fairly_valued: { badge: "secondary" as const, label: "Fairly Valued", color: "text-muted-foreground" },
  overvalued: { badge: "destructive" as const, label: "Overvalued", color: "text-danger" },
};

// Only show models that have a known name and link
const ACTIVE_MODEL_TYPES = new Set(Object.keys(MODEL_NAMES));

interface Props {
  summary: ValuationSummary;
}

export function SummaryCard({ summary }: Props) {
  const verdict = VERDICT_CONFIG[summary.verdict];
  const applicableModels = summary.models.filter(
    (m) => m.fair_value > 0 && ACTIVE_MODEL_TYPES.has(m.model_type)
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
                ${summary.consensus_fair_value.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">USD</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Based on {applicableModels.length} valuation models.
              The range is ${summary.consensus_low.toFixed(2)} – ${summary.consensus_high.toFixed(2)} USD.
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
                {summary.consensus_upside > 0 ? "+" : ""}
                {summary.consensus_upside.toFixed(1)}%
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
                <tr className="border-b-2 border-brand/40">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground" />
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Range</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Selected</th>
                  <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Upside</th>
                </tr>
              </thead>
              <tbody>
                {applicableModels.map((m) => {
                  const link = MODEL_LINKS[m.model_type];
                  const href = link ? `/${summary.ticker}${link}` : null;

                  return (
                    <tr key={m.model_type} className="border-b border-muted/30 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4 font-medium whitespace-nowrap">
                        {href ? (
                          <Link href={href} className="text-primary hover:underline">
                            {MODEL_NAMES[m.model_type] ?? m.model_type}
                          </Link>
                        ) : (
                          MODEL_NAMES[m.model_type] ?? m.model_type
                        )}
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
                            ? "text-success"
                            : m.upside_percent < 0
                              ? "text-danger"
                              : "text-muted-foreground"
                        }`}
                      >
                        {m.upside_percent > 0 ? "+" : ""}
                        {m.upside_percent.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}
