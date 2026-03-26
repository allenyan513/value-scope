import type { AnalystRecommendation, PriceTargetConsensus } from "@/types";
import { formatCurrency } from "@/lib/format";

interface Props {
  ticker: string;
  companyName: string;
  currentPrice: number;
  recommendations: AnalystRecommendation | null;
  priceTargets: PriceTargetConsensus | null;
  nextEarningsDate: string | null;
}

function consensusColor(consensus: string): string {
  const c = consensus.toLowerCase();
  if (c.includes("strong buy")) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (c.includes("buy")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
  if (c.includes("hold")) return "bg-amber-500/15 text-amber-400 border-amber-500/25";
  if (c.includes("sell")) return "bg-red-500/15 text-red-400 border-red-500/25";
  return "bg-muted text-muted-foreground border-border";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AnalystConsensusHero({
  ticker,
  companyName,
  currentPrice,
  recommendations,
  priceTargets,
  nextEarningsDate,
}: Props) {
  if (!recommendations && !priceTargets) return null;

  const hasRecommendations = recommendations && recommendations.totalAnalysts > 0;
  const consensus = recommendations?.consensus ?? "";
  const totalAnalysts = recommendations?.totalAnalysts ?? 0;
  const avgTarget = priceTargets?.target_consensus ?? 0;
  const ptAnalysts = priceTargets?.number_of_analysts ?? 0;
  const upside = currentPrice > 0 && avgTarget > 0 ? ((avgTarget - currentPrice) / currentPrice) * 100 : 0;
  const upsideColor = upside >= 0 ? "text-emerald-400" : "text-red-400";
  const isPositive = upside >= 0;

  return (
    <div className="val-card">
      {/* Verdict banner */}
      {avgTarget > 0 && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            isPositive
              ? "bg-emerald-900/20 text-emerald-400 border border-emerald-800/30"
              : "bg-red-900/20 text-red-400 border border-red-800/30"
          }`}
        >
          {isPositive ? "▲" : "▼"} Wall Street analysts forecast {ticker} to{" "}
          {isPositive ? "rise" : "fall"}{" "}
          {Math.abs(upside).toFixed(0)}% over the next 12 months.
        </div>
      )}

      <div className="val-stats">
        {/* Consensus Rating — only if available */}
        {hasRecommendations && (
          <div>
            <div className="val-stat-label">Consensus Rating</div>
            <div className={`inline-block rounded-md border px-3 py-1 text-lg font-bold ${consensusColor(consensus)}`}>
              {consensus}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {totalAnalysts} analysts
            </div>
          </div>
        )}

        {/* Avg Price Target */}
        {avgTarget > 0 && (
          <div>
            <div className="val-stat-label">Avg Price Target</div>
            <div className="val-stat-value">{formatCurrency(avgTarget)}</div>
            <div className={`text-sm font-semibold ${upsideColor}`}>
              {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% {isPositive ? "upside" : "downside"}
            </div>
          </div>
        )}

        {/* Price Target Analyst Count — show if different from recommendation count */}
        {ptAnalysts > 0 && !hasRecommendations && (
          <div>
            <div className="val-stat-label"># of Analysts</div>
            <div className="val-stat-value">{ptAnalysts}</div>
            <div className="text-xs text-muted-foreground">price target coverage</div>
          </div>
        )}

        {/* Next Earnings — only if available */}
        {nextEarningsDate && (
          <div>
            <div className="val-stat-label">Next Earnings</div>
            <div className="text-xl font-bold">
              {formatDate(nextEarningsDate)}
            </div>
          </div>
        )}
      </div>

      {/* Narrative */}
      <p className="val-prose">
        {hasRecommendations ? (
          <>
            Based on {totalAnalysts} Wall Street analysts, {companyName} ({ticker})
            has a consensus rating of{" "}
            <span className="font-semibold text-foreground">{consensus}</span>.
            {avgTarget > 0 && (
              <>
                {" "}The average 12-month price target is{" "}
                <span className="font-semibold text-foreground">{formatCurrency(avgTarget)}</span>,
                implying{" "}
                <span className={`font-semibold ${upsideColor}`}>
                  {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
                </span>{" "}
                {isPositive ? "upside" : "downside"} from the current price of{" "}
                {formatCurrency(currentPrice)}.
              </>
            )}
          </>
        ) : avgTarget > 0 ? (
          <>
            According to Wall Street analysts, the average 12-month price target for{" "}
            {companyName} ({ticker}) is{" "}
            <span className="font-semibold text-foreground">{formatCurrency(avgTarget)}</span>,
            implying{" "}
            <span className={`font-semibold ${upsideColor}`}>
              {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
            </span>{" "}
            {isPositive ? "upside" : "downside"} from the current price of{" "}
            {formatCurrency(currentPrice)}.
          </>
        ) : null}
      </p>
    </div>
  );
}
