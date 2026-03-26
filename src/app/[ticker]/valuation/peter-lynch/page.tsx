import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../../data";
import { formatCurrency, getUpsideColor } from "@/lib/format";
import { cn } from "@/lib/utils";

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
    description: `${company?.name ?? upperTicker} Peter Lynch fair value analysis using PEG ratio and earnings growth. Is ${upperTicker} undervalued?`,
  };
}

export default async function PeterLynchPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary } = await getCoreTickerData(upperTicker);

  if (!summary) {
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
        Peter Lynch Fair Value not available — insufficient earnings data.
      </p>
    );
  }

  const details = model.details as Record<string, unknown>;
  const upside = model.upside_percent;
  const currentPrice = summary.current_price;
  const earningsGrowth = details.earnings_growth_rate as number | undefined;
  const dividendYield = details.dividend_yield as number | undefined;
  const adjustedGrowth = (earningsGrowth ?? 0) + (dividendYield ?? 0);
  const trailingPE = details.trailing_pe as number | undefined;
  const pegRatio = details.peg_ratio as number | undefined;
  const earningsHistory = details.earnings_history as Array<{ year: number; eps: number }> | undefined;

  return (
    <>
      <h2 className="text-xl font-bold mb-6">Peter Lynch Fair Value</h2>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        {/* Header with verdict */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Fair Value</div>
            <div className="text-3xl font-bold">{formatCurrency(model.fair_value)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Stock Price</div>
            <div className="text-lg font-semibold">{formatCurrency(currentPrice)}</div>
          </div>
          <div className={cn("text-lg font-bold", getUpsideColor(upside))}>
            {upside > 0 ? "+" : ""}{upside.toFixed(1)}% Upside
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Trailing P/E" value={trailingPE ? `${trailingPE.toFixed(1)}x` : "N/A"} />
          <MetricCard label="Earnings Growth" value={earningsGrowth ? `${(earningsGrowth * 100).toFixed(1)}%` : "N/A"} />
          <MetricCard label="Dividend Yield" value={dividendYield ? `${(dividendYield * 100).toFixed(1)}%` : "0%"} />
          <MetricCard label="PEG Ratio" value={pegRatio ? pegRatio.toFixed(2) : "N/A"} />
        </div>

        {/* Calculation */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Calculation
          </h3>
          <div className="space-y-1.5 text-sm max-w-md">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Earnings Growth Rate</span>
              <span>{earningsGrowth ? `${(earningsGrowth * 100).toFixed(1)}%` : "N/A"}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">(+) Dividend Yield</span>
              <span>{dividendYield ? `${(dividendYield * 100).toFixed(1)}%` : "0%"}</span>
            </div>
            <div className="border-t my-1" />
            <div className="flex justify-between py-0.5 font-semibold">
              <span className="text-muted-foreground">Adjusted Growth Rate</span>
              <span>{(adjustedGrowth * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Fair P/E (= Adjusted Growth * 100)</span>
              <span>{(adjustedGrowth * 100).toFixed(1)}x</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">(*) Trailing EPS</span>
              <span>{details.trailing_eps ? `$${(details.trailing_eps as number).toFixed(2)}` : "N/A"}</span>
            </div>
            <div className="border-t my-1" />
            <div className="flex justify-between py-0.5 font-semibold text-primary">
              <span>Fair Value</span>
              <span>{formatCurrency(model.fair_value)}</span>
            </div>
          </div>
        </div>

        {/* Earnings History */}
        {earningsHistory && earningsHistory.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Earnings History
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 font-medium">Year</th>
                    <th className="text-right py-2 font-medium">EPS</th>
                    <th className="text-right py-2 font-medium">YoY Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {earningsHistory.map((entry, i) => {
                    const prev = earningsHistory[i + 1];
                    const growth = prev && prev.eps > 0
                      ? ((entry.eps - prev.eps) / prev.eps) * 100
                      : null;
                    return (
                      <tr key={entry.year} className="border-b">
                        <td className="py-2">{entry.year}</td>
                        <td className="py-2 text-right font-mono">${entry.eps.toFixed(2)}</td>
                        <td className={cn("py-2 text-right font-mono", growth !== null && growth >= 0 ? "text-green-600" : "text-red-600")}>
                          {growth !== null ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Range */}
        <div className="text-sm text-muted-foreground">
          Fair value range: {formatCurrency(model.low_estimate ?? model.fair_value)} – {formatCurrency(model.high_estimate ?? model.fair_value)}
        </div>
      </div>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
