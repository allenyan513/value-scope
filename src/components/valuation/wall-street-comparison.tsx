import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { PriceTargetConsensus, AnalystRecommendation } from "@/types";

interface Props {
  ticker: string;
  companyName: string;
  currentPrice: number;
  consensusFairValue: number;
  consensusUpside: number;
  priceTargets: PriceTargetConsensus | null;
  recommendations: AnalystRecommendation | null;
}

function verdictLabel(upside: number): { text: string; color: string } {
  if (upside >= 15) return { text: "Undervalued", color: "text-emerald-400" };
  if (upside >= 0) return { text: "Fairly Valued", color: "text-muted-foreground" };
  if (upside >= -15) return { text: "Fairly Valued", color: "text-muted-foreground" };
  return { text: "Overvalued", color: "text-red-400" };
}

export function WallStreetComparison({
  ticker,
  companyName,
  currentPrice,
  consensusFairValue,
  consensusUpside,
  priceTargets,
  recommendations,
}: Props) {
  if (!priceTargets) return null;

  const wallStreetTarget = priceTargets.target_consensus;
  const wallStreetUpside =
    currentPrice > 0
      ? ((wallStreetTarget - currentPrice) / currentPrice) * 100
      : 0;

  const vsVerdict = verdictLabel(consensusUpside);
  const wsVerdict = verdictLabel(wallStreetUpside);

  // Determine agreement or divergence
  const bothBullish = consensusUpside > 0 && wallStreetUpside > 0;
  const bothBearish = consensusUpside < 0 && wallStreetUpside < 0;
  const agree = bothBullish || bothBearish;

  return (
    <div className="val-card">
      <div className="flex items-center justify-between">
        <h3 className="val-card-title">ValuScope vs Wall Street</h3>
        <Link
          href={`/${ticker}/valuation/analyst-estimates`}
          className="text-xs text-primary hover:underline"
        >
          View analyst details →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* ValuScope column */}
        <div className="rounded-lg border p-5 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            ValuScope Fair Value
          </div>
          <div className="text-2xl font-bold font-mono">
            {formatCurrency(consensusFairValue)}
          </div>
          <div className={`text-sm font-semibold ${consensusUpside >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {consensusUpside >= 0 ? "+" : ""}{consensusUpside.toFixed(1)}% {consensusUpside >= 0 ? "upside" : "downside"}
          </div>
          <div className={`text-xs font-medium ${vsVerdict.color}`}>
            {vsVerdict.text}
          </div>
          <div className="text-xs text-muted-foreground">
            Based on DCF, Multiples & PEG models
          </div>
        </div>

        {/* Wall Street column */}
        <div className="rounded-lg border p-5 space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Wall Street Target
          </div>
          <div className="text-2xl font-bold font-mono">
            {formatCurrency(wallStreetTarget)}
          </div>
          <div className={`text-sm font-semibold ${wallStreetUpside >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {wallStreetUpside >= 0 ? "+" : ""}{wallStreetUpside.toFixed(1)}% {wallStreetUpside >= 0 ? "upside" : "downside"}
          </div>
          <div className={`text-xs font-medium ${wsVerdict.color}`}>
            {recommendations?.consensus ?? wsVerdict.text}
          </div>
          <div className="text-xs text-muted-foreground">
            Analyst consensus price target
          </div>
        </div>
      </div>

      {/* Agreement / Divergence narrative */}
      <p className="val-prose">
        {agree ? (
          <>
            Both ValuScope&apos;s quantitative models and Wall Street analysts{" "}
            {bothBullish ? "agree" : "agree"} that{" "}
            {companyName} ({ticker}) is{" "}
            <span className={`font-semibold ${bothBullish ? "text-emerald-400" : "text-red-400"}`}>
              {bothBullish ? "undervalued" : "overvalued"}
            </span>{" "}
            at the current price of {formatCurrency(currentPrice)},
            though they differ on magnitude
            (ValuScope: {consensusUpside >= 0 ? "+" : ""}{consensusUpside.toFixed(0)}% vs
            Wall Street: {wallStreetUpside >= 0 ? "+" : ""}{wallStreetUpside.toFixed(0)}%).
          </>
        ) : (
          <>
            ValuScope&apos;s quantitative models and Wall Street analysts{" "}
            <span className="font-semibold text-amber-400">diverge</span>{" "}
            on {companyName} ({ticker}).{" "}
            {consensusUpside < 0 ? (
              <>
                Our models suggest the stock is overvalued by{" "}
                {Math.abs(consensusUpside).toFixed(0)}%, while analysts see{" "}
                {wallStreetUpside.toFixed(0)}% upside.
                This gap may reflect growth expectations not yet visible in current financials.
              </>
            ) : (
              <>
                Our models see {consensusUpside.toFixed(0)}% upside, while analysts
                are more cautious with a {wallStreetUpside.toFixed(0)}% target.
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
