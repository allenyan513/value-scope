"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { PriceTargetConsensus, DailyPrice } from "@/types";
import { formatCurrency } from "@/lib/format";

function pctChange(from: number, to: number): { text: string; color: string } {
  if (from <= 0) return { text: "—", color: "text-muted-foreground" };
  const pct = ((to - from) / from) * 100;
  const sign = pct >= 0 ? "+" : "";
  const color = pct >= 0 ? "text-emerald-600" : "text-red-600";
  return { text: `${sign}${pct.toFixed(0)}%`, color };
}

interface Props {
  ticker: string;
  companyName: string;
  currentPrice: number;
  priceTargets: PriceTargetConsensus;
  priceHistory: DailyPrice[];
}

export function PriceTargetsSummary({
  ticker,
  companyName,
  currentPrice,
  priceTargets,
  priceHistory,
}: Props) {
  const avg = priceTargets.target_consensus;
  const low = priceTargets.target_low;
  const high = priceTargets.target_high;

  const avgPct = pctChange(currentPrice, avg);
  const lowPct = pctChange(currentPrice, low);
  const highPct = pctChange(currentPrice, high);

  const isPositive = avg > currentPrice;

  // Build chart data: historical prices + 1-year forward projection
  const historicalData = priceHistory
    .slice(-365 * 2) // last 2 years
    .map((p) => ({
      date: p.date,
      price: p.close,
      targetLow: null as number | null,
      targetHigh: null as number | null,
      targetLine: null as number | null,
    }));

  // Add projection: today → 1 year from now
  const today = new Date();
  const oneYearLater = new Date(today);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  // Transition point (connect historical to projection)
  const transitionPoint = {
    date: today.toISOString().split("T")[0],
    price: currentPrice,
    targetLow: currentPrice,
    targetHigh: currentPrice,
    targetLine: currentPrice,
  };

  // End point (1 year out)
  const endPoint = {
    date: oneYearLater.toISOString().split("T")[0],
    price: null as number | null,
    targetLow: low,
    targetHigh: high,
    targetLine: avg,
  };

  // Mid-point for smooth fan (6 months out)
  const sixMonths = new Date(today);
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const midPoint = {
    date: sixMonths.toISOString().split("T")[0],
    price: null as number | null,
    targetLow: currentPrice + (low - currentPrice) * 0.5,
    targetHigh: currentPrice + (high - currentPrice) * 0.5,
    targetLine: currentPrice + (avg - currentPrice) * 0.5,
  };

  const chartData = [...historicalData, transitionPoint, midPoint, endPoint];

  const allPrices = [
    ...priceHistory.map((p) => p.close),
    low,
    high,
    currentPrice,
  ].filter(Boolean);
  const yMin = Math.floor(Math.min(...allPrices) * 0.9);
  const yMax = Math.ceil(Math.max(...allPrices) * 1.1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {ticker} Price Targets Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Verdict Banner */}
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            isPositive
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {isPositive ? "▲" : "▼"} Wall Street analysts forecast {ticker} to{" "}
          {isPositive ? "rise" : "fall"}{" "}
          {Math.abs(((avg - currentPrice) / currentPrice) * 100).toFixed(0)}%
          over the next 12 months.
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          According to Wall Street analysts, the average 1-year price target for{" "}
          {companyName} ({ticker}) is{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(avg)}
          </span>{" "}
          with a low forecast of {formatCurrency(low)} and a high forecast of{" "}
          {formatCurrency(high)}. The current price is {formatCurrency(currentPrice)}.
        </p>

        {/* 3-Column Target Cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Lowest Target", value: low, pct: lowPct },
            { label: "Average Target", value: avg, pct: avgPct },
            { label: "Highest Target", value: high, pct: highPct },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border p-4 text-center space-y-1"
            >
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                {item.label}
              </div>
              <div className="text-lg font-bold font-mono">
                {formatCurrency(item.value)}
              </div>
              <div className={`text-sm font-semibold ${item.pct.color}`}>
                {item.pct.text}
              </div>
            </div>
          ))}
        </div>

        {/* Chart: historical + forward fan */}
        {priceHistory.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-0.5 bg-slate-700 inline-block" />
                Historical Price
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-0 border-t-2 border-dashed border-emerald-500 inline-block" />
                Consensus Target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-3 bg-emerald-100 inline-block rounded-sm" />
                Target Range
              </span>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(0, 0%, 55%)" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(0, 0%, 88%)" }}
                  tickFormatter={(d: string) => {
                    const date = new Date(d + "T00:00:00");
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    });
                  }}
                  interval="equidistantPreserveStart"
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 11, fill: "hsl(0, 0%, 55%)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                  width={55}
                  orientation="right"
                />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid hsl(0, 0%, 88%)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                  formatter={(value, name) => {
                    if (value == null) return [null, null];
                    const labels: Record<string, string> = {
                      price: "Price",
                      targetLine: "Consensus Target",
                      targetHigh: "High Target",
                      targetLow: "Low Target",
                    };
                    return [formatCurrency(Number(value)), labels[String(name)] ?? name];
                  }}
                  labelFormatter={(label) => {
                    const d = new Date(label + "T00:00:00");
                    return d.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    });
                  }}
                />
                {/* Target range fan (area between low and high) */}
                <Area
                  type="monotone"
                  dataKey="targetHigh"
                  stroke="none"
                  fill="hsl(152, 60%, 90%)"
                  fillOpacity={0.8}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="targetLow"
                  stroke="none"
                  fill="white"
                  fillOpacity={1}
                  connectNulls={false}
                />
                {/* Consensus target dashed line */}
                <Line
                  type="monotone"
                  dataKey="targetLine"
                  stroke="hsl(152, 60%, 45%)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                />
                {/* Historical price solid line */}
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="hsl(220, 20%, 30%)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
