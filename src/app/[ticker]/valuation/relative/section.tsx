"use client";

import type { RelativeValuationData } from "./data";
import { formatLargeNumber, formatCurrency } from "@/lib/format";

function formatNumber(n: number, decimals = 1): string {
  return formatLargeNumber(n, { prefix: "", decimals, includeK: true });
}

function UpsideBadge({ upside }: { upside: number }) {
  const isPositive = upside >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold ${
        isPositive
          ? "bg-green-950 text-green-400"
          : "bg-red-950 text-red-400"
      }`}
    >
      {isPositive ? "+" : ""}{upside.toFixed(1)}% Upside
    </span>
  );
}

export function RelativeValuationSection({ data }: { data: RelativeValuationData }) {
  const hasTrailing = data.trailingMultiple !== null;
  const hasForward = data.forwardMultiple !== null;
  const upside = data.selectedUpside;

  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Key stats row */}
      {data.selectedFairPrice > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Fair Value
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(data.selectedFairPrice)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Market Price
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(data.currentPrice)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Upside / Downside
            </div>
            <div className={`text-2xl font-bold font-mono ${upside >= 0 ? "text-green-400" : "text-red-400"}`}>
              {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Method
            </div>
            <div className="text-lg font-medium mt-1">
              {data.label}
            </div>
          </div>
        </div>
      )}

      {/* Summary Table */}
      <div className="mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 font-medium"></th>
              <th className="text-center py-2 font-medium">Range</th>
              <th className="text-center py-2 font-medium">Selected</th>
            </tr>
          </thead>
          <tbody>
            {hasTrailing && data.trailingMultiple && (
              <tr className="border-b">
                <td className="py-2 font-medium">Trailing {data.type === "pe" ? "P/E" : "EV/EBITDA"} multiples</td>
                <td className="py-2 text-center">{data.trailingMultiple.low}x – {data.trailingMultiple.high}x</td>
                <td className="py-2 text-center font-semibold">{data.trailingMultiple.selected}x</td>
              </tr>
            )}
            {hasForward && data.forwardMultiple && (
              <tr className="border-b">
                <td className="py-2 font-medium">Forward {data.type === "pe" ? "P/E" : "EV/EBITDA"} multiples</td>
                <td className="py-2 text-center">{data.forwardMultiple.low}x – {data.forwardMultiple.high}x</td>
                <td className="py-2 text-center font-semibold">{data.forwardMultiple.selected}x</td>
              </tr>
            )}
            <tr className="border-b">
              <td className="py-2 font-medium text-primary">Fair Price</td>
              <td className="py-2 text-center">
                {hasTrailing && data.trailingFairPrice ? formatCurrency(data.trailingFairPrice) : "—"}
                {hasForward && data.forwardFairPrice ? ` – ${formatCurrency(data.forwardFairPrice)}` : ""}
              </td>
              <td className="py-2 text-center font-semibold text-primary">{formatCurrency(data.selectedFairPrice)}</td>
            </tr>
            <tr>
              <td className="py-2 font-medium">Upside</td>
              <td className="py-2 text-center">
                {hasTrailing && data.trailingUpside !== null ? `${data.trailingUpside.toFixed(1)}%` : "—"}
                {hasForward && data.forwardUpside !== null ? ` – ${data.forwardUpside.toFixed(1)}%` : ""}
              </td>
              <td className={`py-2 text-center font-semibold ${data.selectedUpside >= 0 ? "text-green-400" : "text-red-400"}`}>
                {data.selectedUpside.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Peer Comparison Table */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Relative Valuation — Benchmarking {data.type === "pe" ? "P/E" : "EV/EBITDA"} against peers
        </h4>
        <p className="text-xs text-muted-foreground mb-3">(USD in millions except Fair Price)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 font-medium">Company</th>
                <th className="text-right py-2 font-medium">Market Cap</th>
                {data.type === "pe" ? (
                  <>
                    <th className="text-right py-2 font-medium">Trailing P/E</th>
                    <th className="text-right py-2 font-medium">Forward P/E</th>
                  </>
                ) : (
                  <th className="text-right py-2 font-medium">EV/EBITDA</th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Company row (highlighted) */}
              <tr className="border-b bg-primary/5 font-semibold">
                <td className="py-2 text-primary">{data.companyName}</td>
                <td className="py-2 text-right">{formatNumber(data.currentPrice * data.sharesOutstanding)}</td>
                {data.type === "pe" ? (
                  <>
                    <td className="py-2 text-right">{data.companyMultiple.trailing?.toFixed(1) ?? "—"}x</td>
                    <td className="py-2 text-right">{data.companyMultiple.forward?.toFixed(1) ?? "—"}x</td>
                  </>
                ) : (
                  <td className="py-2 text-right">{data.companyMultiple.trailing?.toFixed(1) ?? "—"}x</td>
                )}
              </tr>
              {/* Peer rows */}
              {data.peers.map((peer) => {
                const trailingVal = data.type === "pe" ? peer.trailing_pe : peer.ev_ebitda;
                const forwardVal = data.type === "pe" ? peer.forward_pe : null;
                return (
                  <tr key={peer.ticker} className="border-b">
                    <td className="py-2">{peer.name}</td>
                    <td className="py-2 text-right">{formatNumber(peer.market_cap)}</td>
                    <td className="py-2 text-right">{trailingVal ? `${trailingVal.toFixed(1)}x` : "—"}</td>
                    {data.type === "pe" && (
                      <td className="py-2 text-right">{forwardVal ? `${forwardVal.toFixed(1)}x` : "—"}</td>
                    )}
                  </tr>
                );
              })}
              {/* Industry Median */}
              <tr className="border-t-2 font-semibold">
                <td className="py-2">Industry median</td>
                <td className="py-2"></td>
                <td className="py-2 text-right">{data.trailingMultiple?.selected ?? "—"}x</td>
                {data.type === "pe" && (
                  <td className="py-2 text-right">{data.forwardMultiple?.selected ?? "—"}x</td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Calculation Breakdown */}
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Calculation
        </h4>
        <div className={`grid gap-6 ${hasForward ? "grid-cols-2" : "grid-cols-1"}`}>
          {/* Trailing Calculation */}
          {hasTrailing && data.trailingMultiple && data.trailingMetric && data.trailingMetric > 0 && (
            <CalculationColumn
              title="Trailing"
              multiple={data.trailingMultiple.selected}
              multipleLabel={`Industry Median ${data.type === "pe" ? "P/E" : "EV/EBITDA"}`}
              metric={data.trailingMetric}
              metricLabel={data.trailingMetricLabel}
              netDebt={data.netDebt}
              sharesOutstanding={data.sharesOutstanding}
              isEVBased={data.type === "ev_ebitda"}
            />
          )}
          {/* Forward Calculation */}
          {hasForward && data.forwardMultiple && data.forwardMetric && data.forwardMetric > 0 && (
            <CalculationColumn
              title="Forward"
              multiple={data.forwardMultiple.selected}
              multipleLabel={`Industry Median Forward ${data.type === "pe" ? "P/E" : "EV/EBITDA"}`}
              metric={data.forwardMetric}
              metricLabel={data.forwardMetricLabel}
              netDebt={data.netDebt}
              sharesOutstanding={data.sharesOutstanding}
              isEVBased={data.type === "ev_ebitda"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CalculationColumn({
  title,
  multiple,
  multipleLabel,
  metric,
  metricLabel,
  netDebt,
  sharesOutstanding,
  isEVBased,
}: {
  title: string;
  multiple: number;
  multipleLabel: string;
  metric: number;
  metricLabel: string;
  netDebt: number | null;
  sharesOutstanding: number;
  isEVBased: boolean;
}) {
  const rawValue = multiple * metric;

  let equityValue: number;
  if (isEVBased && netDebt !== null) {
    equityValue = rawValue - netDebt;
  } else {
    equityValue = rawValue;
  }

  const fairPrice = equityValue / sharesOutstanding;

  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">
        <CalcRow label={multipleLabel} value={`${multiple}x`} />
        <CalcRow label={`(*) ${metricLabel}`} value={`$${formatNumber(metric)}`} />
        <div className="border-t my-1" />
        <CalcRow
          label={isEVBased ? "Enterprise Value" : "Equity value"}
          value={`$${formatNumber(rawValue)}`}
          highlight
        />
        {isEVBased && netDebt !== null && (
          <>
            <CalcRow label="(−) Net Debt" value={`$${formatNumber(netDebt)}`} />
            <div className="border-t my-1" />
            <CalcRow label="Equity value" value={`$${formatNumber(equityValue)}`} highlight />
          </>
        )}
        <CalcRow label="(/) Outstanding shares" value={formatNumber(sharesOutstanding)} />
        <div className="border-t my-1" />
        <CalcRow label="Fair price" value={`$${fairPrice.toFixed(2)}`} highlight primary />
      </div>
    </div>
  );
}

function CalcRow({
  label,
  value,
  highlight,
  primary,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  primary?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-0.5 ${highlight ? "font-semibold" : ""} ${primary ? "text-primary" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
