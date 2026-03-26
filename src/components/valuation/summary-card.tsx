import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ValuationHero } from "./valuation-hero";
import { formatCurrency } from "@/lib/format";
import type { ValuationSummary } from "@/types";

const MODEL_NAMES: Record<string, string> = {
  dcf_3stage: "DCF (Perpetual Growth)",
  dcf_pe_exit_10y: "DCF (P/E Exit 10Y)",
  dcf_ebitda_exit_fcfe_10y: "DCF (EV/EBITDA Exit 10Y)",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peg: "PEG Fair Value",
};

const MODEL_LINKS: Record<string, string> = {
  dcf_3stage: "/valuation/dcf/perpetual-growth",
  dcf_pe_exit_10y: "/valuation/dcf/pe-exit",
  dcf_ebitda_exit_fcfe_10y: "/valuation/dcf/ev-ebitda-exit",
  pe_multiples: "/valuation/trading-multiples",
  ev_ebitda_multiples: "/valuation/trading-multiples",
  peg: "/valuation/peg",
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

  // Compute normalized weights for display (using raw archetype weights)
  const rawWeights = summary.classification.model_weights;
  const totalWeight = applicableModels.reduce(
    (sum, m) => sum + (rawWeights[m.model_type] ?? 0),
    0
  );

  const adjustments = summary.consensus_adjustments ?? [];
  const primaryModelType = summary.consensus_primary_model;
  const primaryModelName = MODEL_NAMES[primaryModelType] ?? primaryModelType;

  const upsideSign = summary.consensus_upside > 0 ? "+" : "";
  const upsideText = `${upsideSign}${summary.consensus_upside.toFixed(1)}%`;

  return (
    <div className="val-page">
      {/* SEO heading with company name — outside the card */}
      <h2 className="val-h2">
        {summary.company_name} ({summary.ticker}) Valuation Summary
      </h2>

    <ValuationHero
      fairValue={summary.consensus_fair_value}
      currentPrice={summary.current_price}
      upside={summary.consensus_upside}
      narrative={
        <>
          Based on {applicableModels.length} valuation models, {summary.company_name} ({summary.ticker}) has
          a consensus intrinsic value of {formatCurrency(summary.consensus_fair_value)} (range:{" "}
          {formatCurrency(summary.consensus_low)} – {formatCurrency(summary.consensus_high)}),
          suggesting the stock is {verdict.label.toLowerCase()} by{" "}
          {Math.abs(summary.consensus_upside).toFixed(1)}% relative to its current
          market price of {formatCurrency(summary.current_price)}.
        </>
      }
    />

    <Card className="p-6 space-y-4">

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
              const isPrimary = m.model_type === primaryModelType;
              const adjustment = adjustments.find((a) => a.model === m.model_type);

              const normalizedWeight = totalWeight > 0
                ? (rawWeights[m.model_type] ?? 0) / totalWeight
                : 0;
              const contribution = m.fair_value * normalizedWeight;

              return (
                <tr
                  key={m.model_type}
                  className={`border-b border-muted/30 hover:bg-muted/20 ${isPrimary ? "bg-brand/10 border-l-2 border-l-brand" : ""}`}
                >
                  <td className={`py-2.5 pr-4 font-medium whitespace-nowrap ${isPrimary ? "pl-3" : ""}`}>
                    {href ? (
                      <Link href={href} className="text-primary hover:underline">
                        {MODEL_NAMES[m.model_type] ?? m.model_type}
                      </Link>
                    ) : (
                      MODEL_NAMES[m.model_type] ?? m.model_type
                    )}
                    {isPrimary && (
                      <span className="ml-2 text-xs font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                        Primary
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {formatCurrency(m.low_estimate)} – {formatCurrency(m.high_estimate)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {formatCurrency(m.fair_value)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-muted-foreground whitespace-nowrap">
                    {adjustment ? (
                      <>
                        <span className="line-through opacity-50">
                          {(normalizedWeight * 100).toFixed(0)}%
                        </span>{" "}
                        <span className="text-danger font-medium">
                          {(adjustment.adjustedWeight / totalWeight * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      `${(normalizedWeight * 100).toFixed(0)}%`
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-medium">
                    {formatCurrency(contribution)}
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
                {formatCurrency(summary.consensus_fair_value)}
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

      {/* Explanation: classification + primary model + outlier adjustments */}
      <div className="val-prose pt-4 border-t border-muted/30">
        <p>
          <strong>How we calculated this:</strong>{" "}
          {summary.company_name} is classified as a{" "}
          <span className="group/tip relative inline-block">
            <strong className="underline decoration-dotted decoration-muted-foreground cursor-help">
              {summary.classification.label}
              <svg className="inline-block ml-0.5 mb-0.5 size-3.5 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </strong>
            <span className="pointer-events-none absolute left-0 bottom-full mb-2 z-50 w-64 rounded-md bg-foreground text-background text-xs p-3 opacity-0 transition-opacity group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto shadow-lg">
              <span className="font-semibold block mb-1">{summary.classification.label}</span>
              <span className="block mb-1.5 text-background/80">{summary.classification.description}</span>
              {summary.classification.traits.length > 0 && (
                <span className="block border-t border-background/20 pt-1.5 space-y-0.5">
                  {summary.classification.traits.map((trait) => (
                    <span key={trait} className="block">· {trait}</span>
                  ))}
                </span>
              )}
            </span>
          </span>{" "}
          company. The primary model is <strong>{primaryModelName}</strong> (40% weight).{" "}
          <Link href="/methodology#consensus" className="text-primary hover:underline text-sm">
            Learn how weights work &rarr;
          </Link>
        </p>
        {adjustments.length > 0 && (
          <p className="mt-2 text-muted-foreground text-sm">
            <strong>Outlier adjustments:</strong>{" "}
            {adjustments.map((a) =>
              `${MODEL_NAMES[a.model] ?? a.model} — ${a.reason}`
            ).join(". ")}.
          </p>
        )}
      </div>
    </Card>
    </div>
  );
}
