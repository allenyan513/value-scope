"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { HistoricalMultiplesPoint, HistoricalRelativeValuation } from "@/types";

type MultipleKey = "pe" | "ps" | "pb";

const MULTIPLE_CONFIG: Record<
  MultipleKey,
  { label: string; color: string }
> = {
  pe: { label: "P/E", color: "hsl(210, 70%, 50%)" },
  ps: { label: "P/S", color: "hsl(150, 60%, 40%)" },
  pb: { label: "P/B", color: "hsl(25, 70%, 50%)" },
};

interface Props {
  valuation: HistoricalRelativeValuation;
  history: HistoricalMultiplesPoint[];
  currentPrice: number;
}

export function HistoricalMultipleCard({
  valuation,
  history,
  currentPrice,
}: Props) {
  const key = valuation.type as MultipleKey;
  const config = MULTIPLE_CONFIG[key];

  const { chartData, avg, p25, p75 } = useMemo(() => {
    const validPoints = history.filter((d) => d[key] !== null);
    const values = validPoints.map((d) => d[key]!).filter((v) => v > 0);

    if (values.length === 0) {
      return { chartData: [], avg: 0, p25: 0, p75: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avgVal = sum / values.length;

    return {
      chartData: validPoints.map((d) => ({
        date: d.date,
        displayDate: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        value: d[key],
      })),
      avg: Math.round(avgVal * 100) / 100,
      p25: Math.round(sorted[Math.floor(sorted.length * 0.25)] * 100) / 100,
      p75: Math.round(sorted[Math.floor(sorted.length * 0.75)] * 100) / 100,
    };
  }, [history, key]);

  const isExpensive = valuation.deviation > 0;
  const upside = currentPrice > 0
    ? ((valuation.fairValue - currentPrice) / currentPrice) * 100
    : 0;

  return (
    <Card className="p-5">
      {/* Header: current multiple + deviation badge */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="text-3xl font-bold tabular-nums">
            {valuation.currentMultiple !== null
              ? valuation.currentMultiple.toFixed(1)
              : "—"}
          </span>
          <span className="text-sm text-muted-foreground ml-1">x</span>
        </div>
        {valuation.currentMultiple !== null && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              isExpensive
                ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
                : "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400"
            }`}
          >
            {Math.abs(valuation.deviation)}%{" "}
            {isExpensive ? "Expensive" : "Cheap"}
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        {config.label} Ratio
      </h3>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="mb-4">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient
                  id={`gradient-${key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 9, fill: "hsl(0, 0%, 60%)" }}
                tickLine={false}
                axisLine={false}
                interval="equidistantPreserveStart"
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "white",
                  border: "1px solid hsl(0, 0%, 88%)",
                  borderRadius: "6px",
                  fontSize: "11px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                formatter={(value) => [
                  `${Number(value).toFixed(2)}x`,
                  config.label,
                ]}
                labelFormatter={(label) => label}
              />
              <ReferenceLine
                y={avg}
                stroke={config.color}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={config.color}
                strokeWidth={1.5}
                fill={`url(#gradient-${key})`}
                dot={false}
                activeDot={{ r: 3, fill: config.color }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-[10px] text-muted-foreground px-1">
            <span>5Y Avg: {avg.toFixed(1)}x</span>
            <span>
              Range: {p25.toFixed(1)}x – {p75.toFixed(1)}x
            </span>
          </div>
        </div>
      )}

      {/* Percentile bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">Historical Percentile</span>
          <span className="font-semibold tabular-nums">
            {valuation.percentile}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${valuation.percentile}%`,
              backgroundColor: config.color,
              opacity: 0.7,
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Current {config.label} is higher than {valuation.percentile}% of
          historical values
        </p>
      </div>

      {/* Fair Value section */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">
            Fair Value ({config.label} avg × {valuation.metricLabel})
          </span>
          <span
            className={`text-xs font-medium ${
              upside > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {upside > 0 ? "+" : ""}
            {upside.toFixed(1)}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Low (P25)</div>
            <div className="text-sm font-semibold tabular-nums">
              ${valuation.lowEstimate.toFixed(2)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground mb-0.5">Fair Value</div>
            <div className="text-lg font-bold tabular-nums">
              ${valuation.fairValue.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground mb-0.5">High (P75)</div>
            <div className="text-sm font-semibold tabular-nums">
              ${valuation.highEstimate.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
