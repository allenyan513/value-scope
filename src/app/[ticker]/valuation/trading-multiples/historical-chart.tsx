"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { MultipleKey } from "./data";
import type { HistoricalMultiplesResponse } from "@/types";
import { cn } from "@/lib/utils";

const MULTIPLE_OPTIONS: { key: MultipleKey; label: string }[] = [
  { key: "pe", label: "P/E" },
  { key: "ev_ebitda", label: "EV/EBITDA" },
  { key: "pb", label: "P/B" },
  { key: "ps", label: "P/S" },
  { key: "p_fcf", label: "P/FCF" },
];

interface Props {
  ticker: string;
}

export function HistoricalMultiplesChart({ ticker }: Props) {
  const [selected, setSelected] = useState<MultipleKey>("pe");
  const [data, setData] = useState<HistoricalMultiplesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/multiples-history/${ticker}`)
      .then((r) => r.json())
      .then((d: HistoricalMultiplesResponse) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ticker]);

  const stats = data?.stats?.[selected] ?? null;

  const chartData = (data?.history ?? [])
    .map((d) => ({
      date: d.date,
      displayDate: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      }),
      value: d[selected],
    }))
    .filter((d) => d.value !== null && d.value !== undefined);

  return (
    <div className="val-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="val-card-title">Historical Multiples</h3>
        <nav className="flex gap-1 rounded-lg border bg-card p-1">
          {MULTIPLE_OPTIONS.map((opt) => {
            const hasData = data?.stats?.[opt.key] !== null && data?.stats?.[opt.key] !== undefined;
            return (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                disabled={!hasData && !loading}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  selected === opt.key
                    ? "bg-primary text-primary-foreground"
                    : hasData || loading
                      ? "text-muted-foreground hover:text-foreground hover:bg-muted"
                      : "text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
          Loading chart data...
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
          No historical data available for {MULTIPLE_OPTIONS.find((o) => o.key === selected)?.label}.
        </div>
      ) : (
        <>
          {/* Stats legend */}
          {stats && (
            <div className="flex flex-wrap gap-4 mb-3 text-xs text-muted-foreground">
              <span>Current: <span className="font-mono text-foreground">{stats.current?.toFixed(1)}x</span></span>
              <span>5Y Avg: <span className="font-mono text-foreground">{stats.avg5y.toFixed(1)}x</span></span>
              <span>P25: <span className="font-mono">{stats.p25.toFixed(1)}x</span></span>
              <span>P75: <span className="font-mono">{stats.p75.toFixed(1)}x</span></span>
              <span>{stats.dataPoints} data points</span>
            </div>
          )}

          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
                tickLine={false}
                axisLine={{ stroke: "oklch(1 0 0 / 12%)" }}
                interval="equidistantPreserveStart"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}x`}
                width={50}
                orientation="right"
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
                formatter={(value) => [`${Number(value).toFixed(2)}x`, MULTIPLE_OPTIONS.find((o) => o.key === selected)?.label]}
                labelFormatter={(label) => label}
              />

              {/* Reference lines for avg, p25, p75 */}
              {stats && (
                <>
                  <ReferenceLine
                    y={stats.avg5y}
                    stroke="oklch(0.70 0.14 220)"
                    strokeDasharray="6 4"
                    strokeWidth={1}
                  />
                  <ReferenceLine
                    y={stats.p25}
                    stroke="oklch(0.55 0.15 145)"
                    strokeDasharray="3 3"
                    strokeWidth={0.8}
                  />
                  <ReferenceLine
                    y={stats.p75}
                    stroke="oklch(0.60 0.18 25)"
                    strokeDasharray="3 3"
                    strokeWidth={0.8}
                  />
                </>
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke="oklch(0.75 0.12 260)"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: "oklch(0.75 0.12 260)" }}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Chart legend */}
          <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 inline-block" style={{ background: "oklch(0.75 0.12 260)" }} />
              <span>{MULTIPLE_OPTIONS.find((o) => o.key === selected)?.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t border-dashed inline-block" style={{ borderColor: "oklch(0.70 0.14 220)" }} />
              <span>5Y Avg</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t border-dashed inline-block" style={{ borderColor: "oklch(0.55 0.15 145)" }} />
              <span>P25</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0 border-t border-dashed inline-block" style={{ borderColor: "oklch(0.60 0.18 25)" }} />
              <span>P75</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
