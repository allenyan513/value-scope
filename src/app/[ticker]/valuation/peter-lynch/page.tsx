import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../../data";
import { formatCurrency, getUpsideColor, formatLargeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VERDICT_THRESHOLD } from "@/lib/constants";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Peter Lynch Fair Value${company ? ` — ${company.name}` : ""} | ValuScope`,
    description: `Peter Lynch Fair Value analysis for ${company?.name ?? upperTicker} (${upperTicker}). Fair value calculated using earnings growth rate × TTM EPS. Updated daily.`,
  };
}

export default async function PeterLynchPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { company, summary } = await getCoreTickerData(upperTicker);

  if (!summary || !company) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for Peter Lynch analysis.
      </p>
    );
  }

  const model = summary.models.find((m) => m.model_type === "peter_lynch");
  if (!model || model.fair_value === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Peter Lynch Fair Value not available — requires positive trailing EPS and at least 2 years of earnings data.
      </p>
    );
  }

  const details = model.details as Record<string, unknown>;
  const currentPrice = summary.current_price;
  const upside = model.upside_percent;
  const growthRate = details.earnings_growth_rate as number;
  const rawGrowthRate = details.raw_growth_rate as number;
  const ttmEPS = details.ttm_eps as number;
  const fairPE = details.fair_pe as number;
  const growthClamped = details.growth_clamped as boolean;
  const yearsUsed = details.years_used as number;
  const earningsHistory = details.earnings_history as Array<{
    year: number;
    net_income: number;
    eps: number;
    yoy_growth: number | null;
  }> | undefined;

  const verdict = upside > VERDICT_THRESHOLD
    ? "undervalued"
    : upside < -VERDICT_THRESHOLD
      ? "overvalued"
      : "fairly valued";

  return (
    <>
      <h2 className="text-xl font-bold mb-6">
        {company.name} ({upperTicker}) Peter Lynch Fair Value
      </h2>

      <Card className="p-6 space-y-8">
        {/* Key stats */}
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Fair Value
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(model.fair_value)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Stock Price
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(currentPrice)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Upside / Downside
            </div>
            <div className={cn("text-2xl font-bold font-mono", getUpsideColor(upside))}>
              {upside > 0 ? "+" : ""}{upside.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* SEO paragraph */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          Using the Peter Lynch Fair Value formula, {company.name} ({upperTicker}) has an estimated
          fair value of {formatCurrency(model.fair_value)}. With a {yearsUsed}-year earnings growth
          rate of {(growthRate * 100).toFixed(1)}% and trailing EPS of ${ttmEPS.toFixed(2)},
          the Peter Lynch model suggests the stock is {verdict} by{" "}
          {Math.abs(upside).toFixed(1)}% relative to its current market price of {formatCurrency(currentPrice)}.
        </p>

        {/* Formula display */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Fair Value Calculation
          </h3>
          <div className="rounded-md border bg-muted/30 p-5 font-mono text-sm space-y-1">
            <div>
              <span className="text-primary">{company.name} Fair Value</span>
              <span className="text-muted-foreground"> = Earnings Growth Rate × TTM EPS</span>
            </div>
            <div className="pl-[1ch]">
              <span className="text-muted-foreground">= </span>
              <span>{(growthRate * 100).toFixed(0)}</span>
              <span className="text-muted-foreground"> × </span>
              <span>${ttmEPS.toFixed(2)}</span>
            </div>
            <div className="pl-[1ch]">
              <span className="text-muted-foreground">= </span>
              <span className="text-primary font-bold">{formatCurrency(model.fair_value)}</span>
            </div>
          </div>
        </div>

        {/* Calculation details table */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Calculation Details
          </h3>
          <div className="max-w-lg">
            <table className="w-full text-sm">
              <tbody>
                <Row label={`${yearsUsed}Y Net Income CAGR`} value={`${(rawGrowthRate * 100).toFixed(1)}%`} />
                <Row
                  label="Clamped Growth Rate (5–25%)"
                  value={`${(growthRate * 100).toFixed(1)}%`}
                  badge={growthClamped ? "Clamped" : undefined}
                />
                <Row label="Fair P/E (= Growth Rate × 100)" value={`${fairPE.toFixed(1)}x`} highlight />
                <Row label="Trailing EPS" value={`$${ttmEPS.toFixed(2)}`} highlight />
                <Row label="Fair Value" value={formatCurrency(model.fair_value)} primary />
              </tbody>
            </table>
          </div>
        </div>

        {/* Methodology */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Methodology
          </h3>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
            <p>
              The Peter Lynch Fair Value estimates a stock&apos;s intrinsic value using the formula:
              <strong className="text-foreground"> Fair Value = Earnings Growth Rate × TTM EPS</strong>.
              The growth rate represents the average annual growth of net income over the
              last {yearsUsed} years (CAGR).
            </p>
            <p>
              The growth rate is clamped between 5% and 25% — below 5% would undervalue
              stable earners, while above 25% would overvalue cyclical spikes. If trailing EPS
              is negative, this model returns N/A as the formula becomes unreliable.
            </p>
          </div>
        </div>

        {/* Earnings History */}
        {earningsHistory && earningsHistory.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Historical Earnings
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-brand/40 text-muted-foreground">
                    <th className="text-left py-2 font-medium">Year</th>
                    <th className="text-right py-2 font-medium">Net Income</th>
                    <th className="text-right py-2 font-medium">EPS</th>
                    <th className="text-right py-2 font-medium">YoY Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {earningsHistory.map((entry) => (
                    <tr key={entry.year} className="border-b border-muted/30">
                      <td className="py-2 font-medium">{entry.year}</td>
                      <td className="py-2 text-right font-mono">
                        {formatLargeNumber(entry.net_income)}
                      </td>
                      <td className="py-2 text-right font-mono">
                        ${entry.eps?.toFixed(2) ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-mono",
                          entry.yoy_growth !== null && entry.yoy_growth >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        )}
                      >
                        {entry.yoy_growth !== null
                          ? `${entry.yoy_growth >= 0 ? "+" : ""}${entry.yoy_growth.toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

function Row({
  label,
  value,
  badge,
  highlight,
  primary,
}: {
  label: string;
  value: string;
  badge?: string;
  highlight?: boolean;
  primary?: boolean;
}) {
  return (
    <tr className={primary ? "border-t-2 border-brand/40" : "border-b border-muted/30"}>
      <td className={cn("py-2", primary && "font-semibold text-primary")}>
        {label}
        {badge && (
          <Badge variant="secondary" className="ml-2 text-[10px]">
            {badge}
          </Badge>
        )}
      </td>
      <td
        className={cn(
          "py-2 text-right font-mono",
          primary && "font-bold text-primary",
          highlight && "font-medium"
        )}
      >
        {value}
      </td>
    </tr>
  );
}
