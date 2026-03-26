"use client";

import { formatCurrency } from "@/lib/format";

interface Props {
  low: number;
  median: number;
  high: number;
  current: number;
}

export function PriceTargetGauge({ low, median, high, current }: Props) {
  const range = high - low;
  if (range <= 0) return null;

  // Clamp current position between 0% and 100% of the gauge
  const rawPct = ((current - low) / range) * 100;
  const pct = Math.max(2, Math.min(98, rawPct));
  const medianPct = ((median - low) / range) * 100;

  const isBelow = current < low;
  const isAbove = current > high;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Low: {formatCurrency(low)}</span>
        <span>Median: {formatCurrency(median)}</span>
        <span>High: {formatCurrency(high)}</span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-8">
        {/* Background track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full overflow-hidden flex">
          {/* Low → Median zone */}
          <div
            className="bg-red-900/40 h-full"
            style={{ width: `${medianPct}%` }}
          />
          {/* Median → High zone */}
          <div
            className="bg-emerald-900/40 h-full"
            style={{ width: `${100 - medianPct}%` }}
          />
        </div>

        {/* Median marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-muted-foreground/40"
          style={{ left: `${medianPct}%` }}
        />

        {/* Current price marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
        >
          <div className="w-4 h-4 rounded-full bg-primary border-2 border-background shadow-lg" />
        </div>
      </div>

      {/* Current price label */}
      <div className="text-center">
        <span className="text-xs text-muted-foreground">
          Current:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(current)}
          </span>
          {isBelow && " (below target range)"}
          {isAbove && " (above target range)"}
        </span>
      </div>
    </div>
  );
}
