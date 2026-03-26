"use client";

import type { MultipleSummary } from "./data";
import { PercentileBar } from "./percentile-bar";

interface Props {
  multiples: MultipleSummary[];
}

export function MultiplesOverview({ multiples }: Props) {
  // Only show multiples that have data
  const available = multiples.filter((m) => m.current !== null || m.fairValue !== null);

  if (available.length === 0) return null;

  return (
    <div className="val-card">
      <h3 className="val-card-title">Multiples Overview</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {available.map((m) => (
          <MultipleCard key={m.key} data={m} />
        ))}
      </div>
    </div>
  );
}

function MultipleCard({ data }: { data: MultipleSummary }) {
  const hasCurrent = data.current !== null;
  const hasAvg = data.avg5y !== null;
  const isPremium = hasCurrent && hasAvg && data.current! > data.avg5y!;

  // Border color: green if below avg (cheap), red if above (premium)
  const borderClass = !hasCurrent || !hasAvg
    ? "border-border"
    : isPremium
      ? "border-red-900/40"
      : "border-green-900/40";

  return (
    <div className={`rounded-lg border ${borderClass} bg-card/50 p-3 space-y-2`}>
      <div className="text-xs font-medium text-muted-foreground">{data.label}</div>

      {/* Current value */}
      <div className="text-xl font-bold font-mono">
        {hasCurrent ? `${data.current!.toFixed(1)}x` : "—"}
      </div>

      {/* 5Y Average */}
      {hasAvg && (
        <div className="text-[11px] text-muted-foreground">
          5Y Avg: <span className="font-mono">{data.avg5y!.toFixed(1)}x</span>
        </div>
      )}

      {/* vs Peers */}
      {data.peerMedian !== null && hasCurrent && (
        <div className="text-[11px] text-muted-foreground">
          Peers: <span className="font-mono">{data.peerMedian.toFixed(1)}x</span>
          {" "}
          <span className={data.current! > data.peerMedian ? "text-red-400" : "text-green-400"}>
            {data.current! > data.peerMedian ? "▲" : "▼"}
          </span>
        </div>
      )}

      {/* Percentile bar */}
      <PercentileBar percentile={data.percentile} />

      {/* Fair value from this multiple */}
      {data.fairValue !== null && data.upside !== null && (
        <div className="pt-1 border-t border-border/50">
          <div className="text-[11px] text-muted-foreground">Fair Value</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-semibold font-mono">${data.fairValue.toFixed(2)}</span>
            <span className={`text-[11px] font-medium ${data.upside >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.upside >= 0 ? "+" : ""}{data.upside.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
