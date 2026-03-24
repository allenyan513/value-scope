"use client";

import { formatLargeNumber } from "@/lib/format";

interface Props {
  pvFCFTotal: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  fairValue: number;
}

export function TVBreakdown({
  pvFCFTotal,
  pvTerminalValue,
  enterpriseValue,
  netDebt,
  equityValue,
  fairValue,
}: Props) {
  const tvPercent = enterpriseValue > 0 ? (pvTerminalValue / enterpriseValue) * 100 : 0;
  const fcfPercent = enterpriseValue > 0 ? (pvFCFTotal / enterpriseValue) * 100 : 0;

  const isHighTV = tvPercent > 70;
  const isMediumTV = tvPercent > 50;

  return (
    <div className="space-y-4">
      {/* Visual bar showing FCF vs TV proportion */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Enterprise Value Composition
        </div>
        <div className="flex h-8 rounded-md overflow-hidden border">
          <div
            className="bg-blue-500 flex items-center justify-center text-white text-[10px] font-medium transition-all"
            style={{ width: `${Math.max(fcfPercent, 8)}%` }}
            title={`PV of Free Cash Flows: ${formatLargeNumber(pvFCFTotal)}`}
          >
            {fcfPercent >= 15 && `FCF ${fcfPercent.toFixed(0)}%`}
          </div>
          <div
            className={`flex items-center justify-center text-white text-[10px] font-medium transition-all ${
              isHighTV ? "bg-amber-500" : isMediumTV ? "bg-orange-400" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.max(100 - fcfPercent, 8)}%` }}
            title={`PV of Terminal Value: ${formatLargeNumber(pvTerminalValue)}`}
          >
            TV {tvPercent.toFixed(0)}%
          </div>
        </div>

        {/* Warning if TV is high */}
        {isHighTV && (
          <div className="mt-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
            Terminal Value accounts for {tvPercent.toFixed(0)}% of total enterprise value.
            This means the valuation is heavily dependent on long-term growth assumptions.
            Pay close attention to the sensitivity analysis below.
          </div>
        )}
      </div>

      {/* Waterfall breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        <div className="p-2 rounded bg-blue-50">
          <div className="text-[10px] text-muted-foreground">PV of FCFs</div>
          <div className="font-mono font-medium">{formatLargeNumber(pvFCFTotal)}</div>
          <div className="text-[10px] text-blue-600">{fcfPercent.toFixed(1)}%</div>
        </div>
        <div className={`p-2 rounded ${isHighTV ? "bg-amber-50" : "bg-emerald-50"}`}>
          <div className="text-[10px] text-muted-foreground">PV of Terminal Value</div>
          <div className="font-mono font-medium">{formatLargeNumber(pvTerminalValue)}</div>
          <div className={`text-[10px] ${isHighTV ? "text-amber-600" : "text-emerald-600"}`}>{tvPercent.toFixed(1)}%</div>
        </div>
        <div className="p-2 rounded bg-muted/50">
          <div className="text-[10px] text-muted-foreground">= Enterprise Value</div>
          <div className="font-mono font-medium">{formatLargeNumber(enterpriseValue)}</div>
        </div>
        <div className="p-2 rounded bg-muted/50">
          <div className="text-[10px] text-muted-foreground">− Net Debt</div>
          <div className="font-mono font-medium">{formatLargeNumber(netDebt)}</div>
        </div>
        <div className="p-2 rounded bg-muted/50">
          <div className="text-[10px] text-muted-foreground">= Equity Value</div>
          <div className="font-mono font-medium">{formatLargeNumber(equityValue)}</div>
        </div>
        <div className="p-2 rounded bg-green-50">
          <div className="text-[10px] text-muted-foreground">÷ Shares → Fair Value</div>
          <div className="font-mono font-bold text-green-700">${fairValue.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
