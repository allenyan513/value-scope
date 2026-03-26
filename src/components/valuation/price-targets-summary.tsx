"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { PriceTargetConsensus, DailyPrice } from "@/types";
import { formatCurrency } from "@/lib/format";
import { PriceTargetGauge } from "./price-target-gauge";

function pctChange(from: number, to: number): { text: string; color: string } {
  if (from <= 0) return { text: "—", color: "text-muted-foreground" };
  const pct = ((to - from) / from) * 100;
  const sign = pct >= 0 ? "+" : "";
  const color = pct >= 0 ? "text-emerald-400" : "text-red-400";
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
  currentPrice,
  priceTargets,
  priceHistory,
}: Props) {
  const avg = priceTargets.target_consensus;
  const median = priceTargets.target_median;
  const low = priceTargets.target_low;
  const high = priceTargets.target_high;

  const lowPct = pctChange(currentPrice, low);
  const medianPct = pctChange(currentPrice, median || avg);
  const highPct = pctChange(currentPrice, high);

  // Build chart data: ~1 year history + 1 year forward projection
  // Sample historical data to ~12 monthly points so it balances with 12 projection points.
  // This gives roughly 50/50 visual weight between history and forward projection.
  const recentHistory = priceHistory.slice(-365);
  const HISTORY_SAMPLES = 12;
  const step = Math.max(1, Math.floor(recentHistory.length / HISTORY_SAMPLES));
  const sampledHistory = recentHistory.filter((_, i) => i % step === 0 || i === recentHistory.length - 1);
  const historicalData = sampledHistory.map((p) => ({
    date: p.date,
    price: p.close as number | null,
    targetLow: null as number | null,
    targetHigh: null as number | null,
    targetLine: null as number | null,
  }));

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Transition point (connect historical to projection)
  const transitionPoint = {
    date: todayStr,
    price: currentPrice,
    targetLow: currentPrice,
    targetHigh: currentPrice,
    targetLine: currentPrice,
  };

  // Generate monthly projection points so the fan gets proportional chart space
  const projectionPoints: typeof historicalData = [];
  for (let m = 1; m <= 12; m++) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + m);
    const t = m / 12; // interpolation factor 0→1
    projectionPoints.push({
      date: d.toISOString().split("T")[0],
      price: null as number | null,
      targetLow: currentPrice + (low - currentPrice) * t,
      targetHigh: currentPrice + (high - currentPrice) * t,
      targetLine: currentPrice + (avg - currentPrice) * t,
    });
  }

  const chartData = [...historicalData, transitionPoint, ...projectionPoints];

  const allPrices = [
    ...priceHistory.slice(-365).map((p) => p.close),
    low,
    high,
    currentPrice,
  ].filter(Boolean);
  const yMin = Math.floor(Math.min(...allPrices) * 0.9);
  const yMax = Math.ceil(Math.max(...allPrices) * 1.1);

  return (
    <div className="val-card">
      <h3 className="val-card-title">{ticker} Price Targets</h3>

      {/* 3-Column Target Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Lowest Target", value: low, pct: lowPct },
          { label: "Median Target", value: median || avg, pct: medianPct },
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

      {/* Price Target Gauge */}
      <PriceTargetGauge
        low={low}
        median={median || avg}
        high={high}
        current={currentPrice}
      />

      {/* Chart: historical + forward fan */}
      {priceHistory.length > 0 && (
        <div>
          <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 bg-sky-400 inline-block" />
              Historical Price
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-0 border-t-2 border-dashed border-emerald-400 inline-block" />
              Consensus Target
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-3 bg-emerald-500/25 inline-block rounded-sm" />
              Target Range
            </span>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 75, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="fanGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "oklch(0.55 0.02 260)" }}
                tickLine={false}
                axisLine={{ stroke: "oklch(1 0 0 / 10%)" }}
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
                tick={{ fontSize: 11, fill: "oklch(0.55 0.02 260)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${v}`}
                width={50}
                orientation="left"
              />
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
                  if (value == null) return [null, null];
                  const labels: Record<string, string> = {
                    price: "Price",
                    targetLine: "Avg Target",
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
              {/* "Today" vertical divider */}
              <ReferenceLine
                x={todayStr}
                stroke="oklch(0.5 0.02 260)"
                strokeDasharray="4 4"
                label={{
                  value: "Current",
                  position: "top",
                  fontSize: 10,
                  fill: "oklch(0.55 0.02 260)",
                }}
              />
              {/* Target range fan (area between low and high) */}
              <Area
                type="monotone"
                dataKey="targetHigh"
                stroke="none"
                fill="url(#fanGradient)"
                fillOpacity={1}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="targetLow"
                stroke="none"
                fill="oklch(0.16 0.01 260)"
                fillOpacity={1}
                connectNulls={false}
              />
              {/* High target dashed line */}
              <Line
                type="monotone"
                dataKey="targetHigh"
                stroke="#34d399"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
              />
              {/* Low target dashed line */}
              <Line
                type="monotone"
                dataKey="targetLow"
                stroke="#34d399"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
              />
              {/* Consensus target dashed line (brightest) */}
              <Line
                type="monotone"
                dataKey="targetLine"
                stroke="#6ee7b7"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
              />
              {/* Historical price — vibrant blue */}
              <Line
                type="monotone"
                dataKey="price"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              {/* Right-side endpoint labels */}
              <ReferenceLine
                y={high}
                stroke="none"
                label={{ value: `High ${formatCurrency(high)}`, position: "right", fontSize: 11, fill: "#34d399", fontWeight: 600 }}
              />
              <ReferenceLine
                y={avg}
                stroke="none"
                label={{ value: `Avg ${formatCurrency(avg)}`, position: "right", fontSize: 11, fill: "#6ee7b7", fontWeight: 600 }}
              />
              <ReferenceLine
                y={low}
                stroke="none"
                label={{ value: `Low ${formatCurrency(low)}`, position: "right", fontSize: 11, fill: "#34d399", fontWeight: 600 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
