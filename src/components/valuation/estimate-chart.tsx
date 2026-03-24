"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { FinancialStatement, AnalystEstimate, EarningsSurprise } from "@/types";
import { formatLargeNumber, formatCurrency } from "@/lib/format";

// --- Helpers ---

function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function accuracyStars(avgAbsMiss: number): number {
  if (avgAbsMiss <= 0.02) return 5;
  if (avgAbsMiss <= 0.05) return 4;
  if (avgAbsMiss <= 0.10) return 3;
  if (avgAbsMiss <= 0.20) return 2;
  return 1;
}

function renderStars(count: number): string {
  return "★".repeat(count) + "☆".repeat(5 - count);
}

// --- Types ---

interface ChartDataPoint {
  year: string;
  value: number;
  isEstimate: boolean;
  beatMiss: number | null; // surprise %, positive = beat
}

interface Props {
  title: string;
  metricType: "revenue" | "eps";
  ticker: string;
  companyName: string;
  financials: FinancialStatement[];
  estimates: AnalystEstimate[];
  earningsSurprises?: EarningsSurprise[];
}

export function EstimateChart({
  title,
  metricType,
  ticker,
  companyName,
  financials,
  estimates,
  earningsSurprises,
}: Props) {
  const fmt = metricType === "revenue" ? formatLargeNumber : formatCurrency;

  // Sort financials oldest first
  const sortedFinancials = [...financials].sort(
    (a, b) => a.fiscal_year - b.fiscal_year
  );

  // Build actual data points
  const actualPoints: ChartDataPoint[] = sortedFinancials.map((f) => {
    const year = String(f.fiscal_year);
    const value = metricType === "revenue" ? f.revenue : f.eps_diluted;

    let beatMiss: number | null = null;
    if (metricType === "eps" && earningsSurprises) {
      // Match annual: find surprises in the same fiscal year
      const yearSurprises = earningsSurprises.filter(
        (s) => s.date.startsWith(year) || s.date.startsWith(String(f.fiscal_year + 1))
      );
      if (yearSurprises.length > 0) {
        // Use the average surprise across quarters
        const avgSurprise =
          yearSurprises.reduce((sum, s) => sum + s.surprise_percent, 0) /
          yearSurprises.length;
        beatMiss = avgSurprise;
      }
    } else if (metricType === "revenue") {
      // Find matching estimate for this year
      const est = estimates.find((e) => e.period === year);
      if (est && est.revenue_estimate > 0) {
        beatMiss =
          (value - est.revenue_estimate) / Math.abs(est.revenue_estimate);
      }
    }

    return { year, value, isEstimate: false, beatMiss };
  });

  // Build estimate data points (only future years not in financials)
  const actualYears = new Set(sortedFinancials.map((f) => String(f.fiscal_year)));
  const estimatePoints: ChartDataPoint[] = [...estimates]
    .filter((e) => !actualYears.has(e.period))
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((e) => ({
      year: e.period,
      value: metricType === "revenue" ? e.revenue_estimate : e.eps_estimate,
      isEstimate: true,
      beatMiss: null,
    }));

  const allPoints = [...actualPoints, ...estimatePoints];

  if (allPoints.length === 0) {
    return null;
  }

  // Compute CAGRs
  const actuals = actualPoints.filter((p) => p.value > 0);
  const pastCAGR =
    actuals.length >= 2
      ? cagr(
          actuals[0].value,
          actuals[actuals.length - 1].value,
          actuals.length - 1
        )
      : null;

  const estPoints = estimatePoints.filter((p) => p.value > 0);
  const estCAGR =
    estPoints.length >= 1 && actuals.length >= 1
      ? cagr(
          actuals[actuals.length - 1].value,
          estPoints[estPoints.length - 1].value,
          estPoints.length
        )
      : null;

  // Compute accuracy metrics from beat/miss data
  const beatMissValues = actualPoints
    .map((p) => p.beatMiss)
    .filter((v): v is number => v !== null);
  const avgMiss =
    beatMissValues.length > 0
      ? beatMissValues.reduce((s, v) => s + v, 0) / beatMissValues.length
      : null;
  const avgAbsMiss =
    beatMissValues.length > 0
      ? beatMissValues.reduce((s, v) => s + Math.abs(v), 0) /
        beatMissValues.length
      : null;
  const stars = avgAbsMiss !== null ? accuracyStars(avgAbsMiss) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {ticker} {title} Estimates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {pastCAGR !== null && (
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Past CAGR
              </div>
              <div className="text-lg font-bold font-mono">
                {(pastCAGR * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                /year ({actuals.length - 1}Y)
              </div>
            </div>
          )}
          {estCAGR !== null && (
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Est. CAGR
              </div>
              <div className="text-lg font-bold font-mono">
                {(estCAGR * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                /year ({estPoints.length}Y)
              </div>
            </div>
          )}
          {stars !== null && (
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Accuracy
              </div>
              <div className="text-lg font-bold text-amber-500">
                {renderStars(stars)}
              </div>
              <div className="text-xs text-muted-foreground">
                {beatMissValues.length} periods
              </div>
            </div>
          )}
          {avgMiss !== null && (
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                Avg Surprise
              </div>
              <div
                className={`text-lg font-bold font-mono ${
                  avgMiss >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {avgMiss >= 0 ? "+" : ""}
                {(avgMiss * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                {avgMiss >= 0 ? "beat" : "miss"}
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          {pastCAGR !== null && (
            <>
              For the last {actuals.length - 1} years, {companyName}&apos;s{" "}
              {title.toLowerCase()} CAGR is{" "}
              <span className="font-semibold text-foreground">
                {(pastCAGR * 100).toFixed(1)}%
              </span>
              .
            </>
          )}{" "}
          {estCAGR !== null && (
            <>
              The projected CAGR for the next {estPoints.length} year
              {estPoints.length > 1 ? "s" : ""} is{" "}
              <span className="font-semibold text-foreground">
                {(estCAGR * 100).toFixed(1)}%
              </span>
              .
            </>
          )}
        </p>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-slate-700 rounded-sm inline-block" />
            Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-sky-400 rounded-sm inline-block" />
            Estimate
          </span>
        </div>

        {/* Bar Chart */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={allPoints}
            margin={{ top: 20, right: 10, left: 10, bottom: 30 }}
          >
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "hsl(0, 0%, 55%)" }}
              tickLine={false}
              axisLine={{ stroke: "hsl(0, 0%, 88%)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(0, 0%, 55%)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => {
                if (metricType === "revenue") {
                  if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
                  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(0)}B`;
                  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
                  return `${v}`;
                }
                return `$${v.toFixed(1)}`;
              }}
              width={55}
              orientation="right"
            />
            <ReferenceLine y={0} stroke="hsl(0, 0%, 88%)" />
            <Tooltip
              contentStyle={{
                background: "white",
                border: "1px solid hsl(0, 0%, 88%)",
                borderRadius: "6px",
                fontSize: "12px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
              formatter={(value) => [fmt(Number(value)), title]}
              labelFormatter={(label) => `FY ${label}`}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {allPoints.map((entry, index) => (
                <Cell
                  key={index}
                  fill={
                    entry.isEstimate
                      ? "hsl(199, 80%, 65%)"
                      : "hsl(220, 20%, 30%)"
                  }
                  fillOpacity={entry.isEstimate ? 0.7 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Beat/Miss Row */}
        {beatMissValues.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left font-medium text-muted-foreground">
                    Year
                  </th>
                  {actualPoints
                    .filter((p) => p.beatMiss !== null)
                    .map((p) => (
                      <th
                        key={p.year}
                        className="p-2 text-center font-medium text-muted-foreground"
                      >
                        {p.year}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 font-medium text-muted-foreground">
                    Surprise
                  </td>
                  {actualPoints
                    .filter((p) => p.beatMiss !== null)
                    .map((p) => {
                      const isBeat = (p.beatMiss ?? 0) >= 0;
                      return (
                        <td
                          key={p.year}
                          className={`p-2 text-center font-mono font-semibold ${
                            isBeat ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {isBeat ? "Beat" : "Miss"}{" "}
                          {((p.beatMiss ?? 0) * 100).toFixed(1)}%
                        </td>
                      );
                    })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
