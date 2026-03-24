"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { HistoricalMultiplesPoint } from "@/types";

type MultipleKey = "pe" | "ev_ebitda";

const MULTIPLE_CONFIG: Record<
  MultipleKey,
  { label: string; color: string; description: string }
> = {
  pe: {
    label: "P/E",
    color: "hsl(210, 70%, 50%)",
    description: "Price / Earnings — how much investors pay per dollar of earnings",
  },
  ev_ebitda: {
    label: "EV/EBITDA",
    color: "hsl(150, 60%, 40%)",
    description: "Enterprise Value / EBITDA — valuation relative to operating cash flow",
  },
};

interface Props {
  ticker: string;
}

export function MultiplesHistoryChart({ ticker }: Props) {
  const [data, setData] = useState<HistoricalMultiplesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/multiples-history/${ticker}?days=${365 * 5}`)
      .then((res) => res.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d)) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground animate-pulse">
        Loading multiples history...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        No historical multiples data available yet.
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {(["pe", "ps", "pb"] as MultipleKey[]).map((key) => (
        <SingleMultipleChart key={key} data={data} multipleKey={key} />
      ))}
    </div>
  );
}

function SingleMultipleChart({
  data,
  multipleKey,
}: {
  data: HistoricalMultiplesPoint[];
  multipleKey: MultipleKey;
}) {
  const config = MULTIPLE_CONFIG[multipleKey];

  const { chartData, avg, p25, p75, current } = useMemo(() => {
    const validPoints = data.filter((d) => d[multipleKey] !== null);
    const values = validPoints.map((d) => d[multipleKey]!);

    if (values.length === 0) {
      return { chartData: [], avg: 0, p25: 0, p75: 0, current: null };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avgVal = sum / values.length;
    const p25Val = sorted[Math.floor(sorted.length * 0.25)];
    const p75Val = sorted[Math.floor(sorted.length * 0.75)];

    const mapped = validPoints.map((d) => ({
      date: d.date,
      displayDate: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      value: d[multipleKey],
      bandLow: p25Val,
      bandHigh: p75Val,
    }));

    return {
      chartData: mapped,
      avg: Math.round(avgVal * 100) / 100,
      p25: Math.round(p25Val * 100) / 100,
      p75: Math.round(p75Val * 100) / 100,
      current: values[values.length - 1],
    };
  }, [data, multipleKey]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <h4 className="font-medium text-sm mb-1">{config.label} Ratio</h4>
        <p className="text-xs text-muted-foreground">No data available</p>
      </div>
    );
  }

  // Determine if current is above or below average
  const deviation =
    current !== null && avg > 0
      ? Math.round(((current - avg) / avg) * 100)
      : 0;
  const isExpensive = deviation > 0;

  return (
    <div className="rounded-lg border p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="text-2xl font-bold">
            {current !== null ? current.toFixed(1) : "—"}
          </span>
          <span className="text-xs text-muted-foreground ml-1">x</span>
        </div>
        {current !== null && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              isExpensive
                ? "bg-red-50 text-red-600"
                : "bg-green-50 text-green-600"
            }`}
          >
            {Math.abs(deviation)}% {isExpensive ? "Above Avg" : "Below Avg"}
          </span>
        )}
      </div>
      <h4 className="text-sm font-medium text-muted-foreground mb-3">
        {config.label} Ratio
      </h4>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
        >
          {/* Reasonable range band (25th-75th percentile) */}
          <defs>
            <linearGradient id={`band-${multipleKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.color} stopOpacity={0.08} />
              <stop offset="100%" stopColor={config.color} stopOpacity={0.08} />
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
          {/* Historical average line */}
          <ReferenceLine
            y={avg}
            stroke={config.color}
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          {/* 25th percentile line */}
          <ReferenceLine
            y={p25}
            stroke={config.color}
            strokeDasharray="2 4"
            strokeOpacity={0.2}
          />
          {/* 75th percentile line */}
          <ReferenceLine
            y={p75}
            stroke={config.color}
            strokeDasharray="2 4"
            strokeOpacity={0.2}
          />
          {/* Main line */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={config.color}
            strokeWidth={1.5}
            fill={`url(#band-${multipleKey})`}
            dot={false}
            activeDot={{ r: 3, fill: config.color }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Stats row */}
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1">
        <span>Avg: {avg.toFixed(1)}x</span>
        <span>
          Range: {p25.toFixed(1)}x – {p75.toFixed(1)}x
        </span>
      </div>
    </div>
  );
}
