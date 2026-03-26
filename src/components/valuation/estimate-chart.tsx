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
  ErrorBar,
} from "recharts";
import type { FinancialStatement, AnalystEstimate, EarningsSurprise } from "@/types";
import { formatLargeNumber, formatCurrency } from "@/lib/format";
import { EstimateKPIRow } from "./estimate-kpi-row";
import { EstimateBeatMissTable } from "./estimate-beat-miss-table";

// --- Helpers ---

function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

// --- Types ---

interface ChartDataPoint {
  year: string;
  value: number;
  isEstimate: boolean;
  beatMiss: number | null;
  errorUp: number; // distance from value to high estimate
  errorDown: number; // distance from value to low estimate
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
      const yearSurprises = earningsSurprises.filter(
        (s) => s.date.startsWith(year) || s.date.startsWith(String(f.fiscal_year + 1))
      );
      if (yearSurprises.length > 0) {
        const avgSurprise =
          yearSurprises.reduce((sum, s) => sum + s.surprise_percent, 0) /
          yearSurprises.length;
        beatMiss = avgSurprise;
      }
    } else if (metricType === "revenue") {
      const est = estimates.find((e) => e.period === year);
      if (est && est.revenue_estimate > 0) {
        beatMiss =
          (value - est.revenue_estimate) / Math.abs(est.revenue_estimate);
      }
    }

    return { year, value, isEstimate: false, beatMiss, errorUp: 0, errorDown: 0 };
  });

  // Build estimate data points with range whiskers
  const actualYears = new Set(sortedFinancials.map((f) => String(f.fiscal_year)));
  const estimatePoints: ChartDataPoint[] = [...estimates]
    .filter((e) => !actualYears.has(e.period))
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((e) => {
      const value = metricType === "revenue" ? e.revenue_estimate : e.eps_estimate;
      const low = metricType === "revenue" ? e.revenue_low : e.eps_low;
      const high = metricType === "revenue" ? e.revenue_high : e.eps_high;
      return {
        year: e.period,
        value,
        isEstimate: true,
        beatMiss: null,
        errorUp: high > 0 && value > 0 ? high - value : 0,
        errorDown: low > 0 && value > 0 ? value - low : 0,
      };
    });

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

  const beatMissValues = actualPoints
    .map((p) => p.beatMiss)
    .filter((v): v is number => v !== null);

  const hasWhiskers = estimatePoints.some((p) => p.errorUp > 0 || p.errorDown > 0);

  return (
    <div className="val-card">
      <h3 className="val-card-title">
        {ticker} {title} Estimates
      </h3>

      <EstimateKPIRow
        pastCAGR={pastCAGR}
        estCAGR={estCAGR}
        actualsCount={actuals.length}
        estCount={estPoints.length}
        beatMissValues={beatMissValues}
        companyName={companyName}
        title={title}
      />

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-slate-600 rounded-sm inline-block" />
          Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-sky-400 rounded-sm inline-block" />
          Estimate
        </span>
        {hasWhiskers && (
          <span className="flex items-center gap-1.5">
            <span className="w-0.5 h-3 bg-sky-300 inline-block" />
            Low–High Range
          </span>
        )}
      </div>

      {/* Bar Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={allPoints}
          margin={{ top: 20, right: 10, left: 10, bottom: 30 }}
        >
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
            tickLine={false}
            axisLine={{ stroke: "oklch(1 0 0 / 12%)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
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
          <ReferenceLine y={0} stroke="oklch(1 0 0 / 12%)" />
          <Tooltip
            contentStyle={{
              background: "oklch(0.22 0.015 260)",
              border: "1px solid oklch(1 0 0 / 12%)",
              borderRadius: "4px",
              fontSize: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              color: "oklch(0.95 0.005 260)",
            }}
            formatter={(value, name) => {
              if (name === "value") return [fmt(Number(value)), title];
              return [null, null];
            }}
            labelFormatter={(label) => `FY ${label}`}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {hasWhiskers && (
              <ErrorBar
                dataKey="errorUp"
                width={6}
                strokeWidth={1.5}
                stroke="oklch(0.75 0.12 220)"
                direction="y"
              />
            )}
            {allPoints.map((entry, index) => (
              <Cell
                key={index}
                fill={
                  entry.isEstimate
                    ? "oklch(0.70 0.14 220)"
                    : "oklch(0.50 0.04 260)"
                }
                fillOpacity={entry.isEstimate ? 0.7 : 1}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <EstimateBeatMissTable actualPoints={actualPoints} />
    </div>
  );
}
