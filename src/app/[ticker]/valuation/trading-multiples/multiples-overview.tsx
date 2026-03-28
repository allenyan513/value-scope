"use client";

import type { MultipleDetail, MultipleKey } from "./data";

interface Props {
  multiples: MultipleDetail[];
  currentPrice: number;
  activeKey: MultipleKey;
  onKeyChange: (key: MultipleKey) => void;
}

export function MultiplesOverview({ multiples, currentPrice, activeKey, onKeyChange }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {multiples.map((m) => {
        const isActive = m.key === activeKey;
        return (
          <button
            key={m.key}
            onClick={() => onKeyChange(m.key)}
            className={`text-left rounded-lg border p-4 transition-all ${
              isActive
                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                : "border-border/60 bg-card/50 hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">{m.label} Multiples</span>
              {m.fairValue !== null && m.upside !== null && (
                <span className={`text-xs font-semibold ${m.upside >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {m.upside >= 0 ? "+" : ""}{m.upside.toFixed(1)}%
                </span>
              )}
            </div>

            {m.fairValue !== null ? (
              <div className="space-y-2">
                {/* Fair value range bar */}
                <FairValueRange
                  low={m.peerRange.p25 > 0
                    ? (m.isEVBased
                      ? (m.peerRange.p25 * (m.trailing?.companyMetric ?? 0) - m.netDebt) / m.sharesOutstanding
                      : m.peerRange.p25 * (m.trailing?.companyMetric ?? 0) / m.sharesOutstanding)
                    : null}
                  selected={m.fairValue}
                  high={m.peerRange.p75 > 0
                    ? (m.isEVBased
                      ? (m.peerRange.p75 * (m.trailing?.companyMetric ?? 0) - m.netDebt) / m.sharesOutstanding
                      : m.peerRange.p75 * (m.trailing?.companyMetric ?? 0) / m.sharesOutstanding)
                    : null}
                  currentPrice={currentPrice}
                />

                {/* Legs summary */}
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  {m.trailing && (
                    <span>Trailing: <span className="font-mono text-foreground">${m.trailing.fairPrice.toFixed(2)}</span></span>
                  )}
                  {m.forward && (
                    <span>Forward: <span className="font-mono text-foreground">${m.forward.fairPrice.toFixed(2)}</span></span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  {m.peerCount} peers &middot; {m.trailing && m.forward ? "Trailing + Forward" : m.trailing ? "Trailing only" : "Forward only"}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Insufficient data</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FairValueRange({
  low,
  selected,
  high,
  currentPrice,
}: {
  low: number | null;
  selected: number;
  high: number | null;
  currentPrice: number;
}) {
  const displayLow = low && low > 0 ? low : selected * 0.7;
  const displayHigh = high && high > 0 ? high : selected * 1.3;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold font-mono">${selected.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">
          ${displayLow.toFixed(0)} – ${displayHigh.toFixed(0)}
        </span>
      </div>
      {/* Simple range indicator */}
      <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-primary/40 rounded-full"
          style={{
            left: "15%",
            right: "15%",
          }}
        />
        {/* Selected marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full"
          style={{ left: "50%" }}
        />
        {/* Current price marker */}
        {currentPrice > 0 && displayLow > 0 && displayHigh > displayLow && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-foreground/60 rounded-full"
            style={{
              left: `${Math.min(95, Math.max(5, ((currentPrice - displayLow) / (displayHigh - displayLow)) * 100))}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
