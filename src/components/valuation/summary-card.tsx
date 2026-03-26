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

const ACTIVE_MODEL_TYPES = new Set(Object.keys(MODEL_NAMES));

interface Props {
  summary: ValuationSummary;
}

export function SummaryCard({ summary }: Props) {
  const verdict = VERDICT_CONFIG[summary.verdict];
  const applicableModels = summary.models.filter(
    (m) => m.fair_value > 0 && ACTIVE_MODEL_TYPES.has(m.model_type)
  );

  // Compute normalized weights for display
  const rawWeights = summary.classification.model_weights;
  const totalWeight = applicableModels.reduce(
    (sum, m) => sum + (rawWeights[m.model_type] ?? 0),
    0
  );

  const upsideSign = summary.consensus_upside > 0 ? "+" : "";
  const upsideText = `${upsideSign}${summary.consensus_upside.toFixed(1)}%`;

  return (
    <Card className="p-6">
      {/* SEO heading with company name */}
      <h2 className="text-lg font-semibold mb-6">
        {summary.company_name} ({summary.ticker}) Valuation Summary
      </h2>

      {/* Key metrics — horizontal stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Intrinsic Value
          </div>
          <div className="text-2xl font-bold font-mono">
            ${summary.consensus_fair_value.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Market Price
          </div>
          <div className="text-2xl font-bold font-mono">
            ${summary.current_price.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Upside / Downside
          </div>
          <div className={`text-2xl font-bold font-mono ${verdict.color}`}>
            {upsideText}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Verdict
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={verdict.badge}>{verdict.label}</Badge>
          </div>
        </div>
      </div>

      {/* SEO summary paragraph */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        Based on {applicableModels.length} valuation models, {summary.company_name} ({summary.ticker}) has
        a consensus intrinsic value of ${summary.consensus_fair_value.toFixed(2)} (range: $
        {summary.consensus_low.toFixed(2)} – ${summary.consensus_high.toFixed(2)}),
        suggesting the stock is {verdict.label.toLowerCase()} by{" "}
        {Math.abs(summary.consensus_upside).toFixed(1)}% relative to its current
        market price of ${summary.current_price.toFixed(2)}.
      </p>

      {/* Models table with weights and contributions */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand/40">
              <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Model</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Range</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Fair Value</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Weight</th>
              <th className="text-right py-2 px-4 font-medium text-muted-foreground">Contribution</th>
              <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Upside</th>
            </tr>
          </thead>
          <tbody>
            {applicableModels.map((m) => {
              const link = MODEL_LINKS[m.model_type];
              const href = link ? `/${summary.ticker}${link}` : null;
              const normalizedWeight = totalWeight > 0
                ? (rawWeights[m.model_type] ?? 0) / totalWeight
                : 0;
              const contribution = m.fair_value * normalizedWeight;

              return (
                <tr key={m.model_type} className="border-b border-muted/30 hover:bg-muted/20">
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
                    {m.low_estimate.toFixed(2)} – {m.high_estimate.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    ${m.fair_value.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">
                    {(normalizedWeight * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-medium">
                    ${contribution.toFixed(2)}
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
          <tfoot>
            <tr className="border-t-2 border-brand/40">
              <td className="py-2.5 pr-4 font-semibold">Weighted Consensus</td>
              <td className="py-2.5 px-4" />
              <td className="py-2.5 px-4" />
              <td className="py-2.5 px-4 text-right font-mono text-muted-foreground">100%</td>
              <td className="py-2.5 px-4 text-right font-mono font-bold">
                ${summary.consensus_fair_value.toFixed(2)}
              </td>
              <td
                className={`py-2.5 pl-4 text-right font-mono font-bold whitespace-nowrap ${verdict.color}`}
              >
                {upsideText}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
