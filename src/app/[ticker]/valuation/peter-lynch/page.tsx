import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../../data";
import { formatCurrency, formatLargeNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ValuationHero } from "@/components/valuation/valuation-hero";
import { PEGGauge } from "@/components/valuation/peg-gauge";
import { Badge } from "@/components/ui/badge";
import type { PeterLynchDetails } from "@/lib/valuation/peter-lynch";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Peter Lynch Fair Value${company ? ` — ${company.name}` : ""} | ValuScope`,
    description: `Peter Lynch PEG-based Fair Value for ${company?.name ?? upperTicker} (${upperTicker}). Uses forward earnings growth, dividend yield, and analyst consensus. Updated daily.`,
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

  const d = model.details as unknown as PeterLynchDetails;
  const currentPrice = summary.current_price;
  const upside = model.upside_percent;

  return (
    <div className="val-page">
      <h2 className="val-h2">
        {company.name} ({upperTicker}) Peter Lynch Fair Value
      </h2>

      {/* Hero: Fair Value / Price / Upside / Verdict */}
      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={currentPrice}
        upside={upside}
        narrative={
          <>
            Using the Peter Lynch PEG framework with{" "}
            {d.growth_source === "forward" ? "analyst consensus forward" : "historical"}{" "}
            EPS growth of {(d.growth_rate * 100).toFixed(1)}%
            {d.dividend_yield > 0 && ` plus ${(d.dividend_yield * 100).toFixed(1)}% dividend yield`}
            , {company.name} has a fair value of {formatCurrency(model.fair_value)} based on{" "}
            {d.eps_label} of ${d.eps_used.toFixed(2)}.
            {d.peg_ratio !== null && (
              <> The current PEG ratio is <strong className="text-foreground">{d.peg_ratio.toFixed(2)}</strong>.</>
            )}
          </>
        }
      />

      {/* PEG Gauge */}
      <div className="val-card">
        <h3 className="val-card-title">PEG Ratio</h3>
        <PEGGauge
          peg={d.peg_ratio}
          currentPE={d.current_pe}
          adjustedGrowth={d.adjusted_growth}
          dividendYield={d.dividend_yield}
          rawGrowth={d.raw_growth_rate}
        />
      </div>

      {/* Fair Value Calculation */}
      <div className="val-card">
        <h3 className="val-h3">Fair Value Calculation</h3>

        {/* Formula */}
        <div className="rounded-md border bg-muted/30 p-5 font-mono text-sm space-y-1">
          <div>
            <span className="text-primary">{company.name} Fair Value</span>
            <span className="text-muted-foreground"> = {d.dividend_yield > 0 ? "(EPS Growth + Div Yield)" : "EPS Growth"} × 100 × {d.ntm_eps ? "NTM" : "TTM"} EPS</span>
          </div>
          <div className="pl-[1ch]">
            <span className="text-muted-foreground">= </span>
            <span>{d.dividend_yield > 0 ? `(${(d.growth_rate * 100).toFixed(1)}% + ${(d.dividend_yield * 100).toFixed(1)}%)` : `${(d.growth_rate * 100).toFixed(1)}%`}</span>
            <span className="text-muted-foreground"> × 100 × </span>
            <span>${d.eps_used.toFixed(2)}</span>
          </div>
          <div className="pl-[1ch]">
            <span className="text-muted-foreground">= </span>
            <span>{d.fair_pe.toFixed(1)}x</span>
            <span className="text-muted-foreground"> × </span>
            <span>${d.eps_used.toFixed(2)}</span>
          </div>
          <div className="pl-[1ch]">
            <span className="text-muted-foreground">= </span>
            <span className="text-primary font-bold">{formatCurrency(model.fair_value)}</span>
          </div>
        </div>

        {/* Calculation details */}
        <div className="max-w-lg">
          <table className="w-full text-sm">
            <tbody>
              <Row
                label="EPS Growth Rate"
                value={`${(d.raw_growth_rate * 100).toFixed(1)}%`}
                badge={d.growth_source === "forward" ? "Forward" : "Historical"}
                badgeVariant={d.growth_source === "forward" ? "default" : "secondary"}
              />
              {d.dividend_yield > 0 && (
                <Row
                  label="Dividend Yield"
                  value={`+${(d.dividend_yield * 100).toFixed(1)}%`}
                />
              )}
              <Row
                label="Adjusted Growth (clamped 8–25%)"
                value={`${(d.growth_rate * 100).toFixed(1)}%`}
                badge={d.growth_clamped ? "Clamped" : undefined}
              />
              <Row label="Fair P/E" value={`${d.fair_pe.toFixed(1)}x`} highlight />
              <Row
                label={d.eps_label}
                value={`$${d.eps_used.toFixed(2)}`}
                highlight
              />
              <Row label="Fair Value" value={formatCurrency(model.fair_value)} primary />
              <Row
                label="Range"
                value={`${formatCurrency(model.low_estimate)} – ${formatCurrency(model.high_estimate)}`}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Growth Story: Forward vs Historical */}
      <div className="val-card">
        <h3 className="val-h3">Growth Analysis</h3>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Forward estimates */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              Forward Growth
              {d.growth_source === "forward" && (
                <Badge variant="default" className="text-[10px]">Active</Badge>
              )}
            </h4>
            {d.forward_estimates.length > 0 ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-muted/30 text-muted-foreground">
                      <th className="text-left py-1.5 font-medium">Period</th>
                      <th className="text-right py-1.5 font-medium">EPS Est.</th>
                      <th className="text-right py-1.5 font-medium">Growth</th>
                      <th className="text-right py-1.5 font-medium">Analysts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Baseline row: latest actual */}
                    <tr className="border-b border-muted/30 text-muted-foreground">
                      <td className="py-1.5">FY{d.earnings_history[d.earnings_history.length - 1]?.year} (actual)</td>
                      <td className="py-1.5 text-right font-mono">${d.ttm_eps.toFixed(2)}</td>
                      <td className="py-1.5 text-right">—</td>
                      <td className="py-1.5 text-right">—</td>
                    </tr>
                    {d.forward_estimates.map((est) => (
                      <tr key={est.period} className="border-b border-muted/30">
                        <td className="py-1.5">FY{est.period}E</td>
                        <td className="py-1.5 text-right font-mono">${est.eps.toFixed(2)}</td>
                        <td className={cn(
                          "py-1.5 text-right font-mono",
                          est.growth_pct !== null && est.growth_pct >= 0 ? "text-green-400" : "text-red-400",
                        )}>
                          {est.growth_pct !== null ? `${est.growth_pct >= 0 ? "+" : ""}${est.growth_pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground">{est.analysts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.forward_growth !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {d.forward_years}Y Forward EPS CAGR:{" "}
                    <span className="text-foreground font-medium">
                      {(d.forward_growth * 100).toFixed(1)}%
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No analyst estimates available.
              </p>
            )}
          </div>

          {/* Historical earnings */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              Historical Growth
              {d.growth_source === "historical" && (
                <Badge variant="default" className="text-[10px]">Active</Badge>
              )}
            </h4>
            {d.earnings_history.length > 0 && (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-muted/30 text-muted-foreground">
                      <th className="text-left py-1.5 font-medium">Year</th>
                      <th className="text-right py-1.5 font-medium">Net Income</th>
                      <th className="text-right py-1.5 font-medium">EPS</th>
                      <th className="text-right py-1.5 font-medium">YoY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.earnings_history.map((entry) => (
                      <tr key={entry.year} className="border-b border-muted/30">
                        <td className="py-1.5">FY{entry.year}</td>
                        <td className="py-1.5 text-right font-mono">{formatLargeNumber(entry.net_income)}</td>
                        <td className="py-1.5 text-right font-mono">
                          ${entry.eps?.toFixed(2) ?? "—"}
                        </td>
                        <td className={cn(
                          "py-1.5 text-right font-mono",
                          entry.yoy_growth !== null && entry.yoy_growth >= 0
                            ? "text-green-400"
                            : "text-red-400",
                        )}>
                          {entry.yoy_growth !== null
                            ? `${entry.yoy_growth >= 0 ? "+" : ""}${entry.yoy_growth.toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {d.historical_growth !== null && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {d.historical_years}Y Historical EPS CAGR:{" "}
                    <span className="text-foreground font-medium">
                      {(d.historical_growth * 100).toFixed(1)}%
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Methodology */}
      <div className="val-card">
        <h3 className="val-h3">Methodology</h3>
        <div className="val-prose space-y-2">
          <p>
            The Peter Lynch Fair Value uses the PEG (Price/Earnings-to-Growth) framework.
            A stock is fairly valued when its P/E ratio equals its earnings growth rate (PEG = 1.0).
            This model adds dividend yield to the growth rate per Lynch&apos;s original PEGY formula.
          </p>
          <p>
            Growth rate priority: analyst consensus forward EPS CAGR (when ≥ 3 analysts cover the stock),
            falling back to historical EPS CAGR. Using EPS rather than net income avoids distortion from
            share buybacks. The growth rate is clamped between 8% and 25% — below 8% would undervalue
            stable earners, while above 25% would overvalue unsustainable spikes.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  badge,
  badgeVariant = "secondary",
  highlight,
  primary,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeVariant?: "default" | "secondary";
  highlight?: boolean;
  primary?: boolean;
}) {
  return (
    <tr className={primary ? "border-t-2 border-brand/40" : "border-b border-muted/30"}>
      <td className={cn("py-2", primary && "font-semibold text-primary")}>
        {label}
        {badge && (
          <Badge variant={badgeVariant} className="ml-2 text-[10px]">
            {badge}
          </Badge>
        )}
      </td>
      <td
        className={cn(
          "py-2 text-right font-mono",
          primary && "font-bold text-primary",
          highlight && "font-medium",
        )}
      >
        {value}
      </td>
    </tr>
  );
}
