"use client";

import type { ValuationResult, ModelApplicability } from "@/types";

const MODEL_LABELS: Record<string, string> = {
  dcf_growth_exit_5y: "DCF Growth 5Y",
  dcf_growth_exit_10y: "DCF Growth 10Y",
  dcf_ebitda_exit_5y: "DCF EBITDA 5Y",
  dcf_ebitda_exit_10y: "DCF EBITDA 10Y",
  dcf_3stage: "DCF Perpetual Growth",
  dcf_pe_exit_10y: "DCF P/E Exit",
  dcf_ebitda_exit_fcfe_10y: "DCF EV/EBITDA Exit",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peter_lynch: "Peter Lynch",
};

const ROLE_COLORS: Record<string, { bar: string; bg: string }> = {
  primary: { bar: "bg-blue-500", bg: "bg-blue-50" },
  cross_check: { bar: "bg-slate-400", bg: "bg-slate-50" },
  sanity_check: { bar: "bg-slate-300", bg: "bg-slate-50" },
  not_applicable: { bar: "bg-slate-200", bg: "bg-slate-50" },
};

const ROLE_LABELS: Record<string, string> = {
  primary: "Primary",
  cross_check: "Cross-Check",
  sanity_check: "Sanity Check",
  not_applicable: "N/A",
};

interface Props {
  models: ValuationResult[];
  currentPrice: number;
  consensusLow: number;
  consensusHigh: number;
  consensusFairValue: number;
  applicability: ModelApplicability[];
}

export function FootballFieldChart({
  models,
  currentPrice,
  consensusLow,
  consensusHigh,
  consensusFairValue,
  applicability,
}: Props) {
  const validModels = models.filter((m) => m.fair_value > 0);
  if (validModels.length === 0) return null;

  // Calculate the range for the chart
  const allValues = validModels.flatMap((m) => [m.low_estimate, m.high_estimate, m.fair_value]);
  allValues.push(currentPrice, consensusLow, consensusHigh);
  const minVal = Math.min(...allValues.filter((v) => v > 0)) * 0.85;
  const maxVal = Math.max(...allValues) * 1.15;
  const range = maxVal - minVal;

  function toPercent(val: number): number {
    return ((val - minVal) / range) * 100;
  }

  const applicabilityMap = new Map(applicability.map((a) => [a.model_type, a]));

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span>Primary Model</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-400" />
          <span>Cross-Check</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          <span>Sanity Check</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-red-500" />
          <span>Current Price</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-green-600 border-dashed" style={{ borderBottom: "2px dashed #16a34a", height: 0 }} />
          <span>Consensus</span>
        </div>
      </div>

      {/* Chart rows */}
      <div className="relative">
        {/* Current price line (vertical) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ left: `${toPercent(currentPrice)}%` }}
        >
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-red-600 whitespace-nowrap">
            ${currentPrice.toFixed(0)}
          </div>
        </div>

        {/* Consensus line */}
        <div
          className="absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-green-600"
          style={{ left: `${toPercent(consensusFairValue)}%` }}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-green-700 whitespace-nowrap">
            ${consensusFairValue.toFixed(0)}
          </div>
        </div>

        <div className="space-y-2 py-6">
          {/* Individual models */}
          {validModels.map((model) => {
            const app = applicabilityMap.get(model.model_type);
            const role = app?.role ?? "cross_check";
            const colors = ROLE_COLORS[role] ?? ROLE_COLORS.cross_check;

            const leftPct = toPercent(model.low_estimate);
            const rightPct = toPercent(model.high_estimate);
            const fairPct = toPercent(model.fair_value);
            const barWidth = rightPct - leftPct;

            return (
              <div key={model.model_type} className="flex items-center gap-2 group">
                {/* Label */}
                <div className="w-28 shrink-0 text-right">
                  <div className="text-xs font-medium truncate">
                    {MODEL_LABELS[model.model_type] ?? model.model_type}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {ROLE_LABELS[role]}
                  </div>
                </div>

                {/* Bar */}
                <div className="flex-1 relative h-7">
                  {/* Range bar */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-sm ${colors.bar} opacity-30`}
                    style={{ left: `${leftPct}%`, width: `${Math.max(barWidth, 0.5)}%` }}
                  />
                  {/* Fair value marker */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-5 rounded-sm ${colors.bar}`}
                    style={{ left: `${fairPct}%`, transform: "translate(-50%, -50%)" }}
                  />
                  {/* Tooltip on hover */}
                  <div
                    className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono bg-popover border rounded px-1.5 py-0.5 shadow-sm whitespace-nowrap z-20"
                    style={{ left: `${fairPct}%`, transform: "translateX(-50%)" }}
                  >
                    ${model.fair_value.toFixed(2)} ({model.upside_percent > 0 ? "+" : ""}{model.upside_percent.toFixed(1)}%)
                  </div>
                </div>

                {/* Value */}
                <div className="w-16 shrink-0 text-right">
                  <span className="text-xs font-mono font-medium">
                    ${model.fair_value.toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Consensus bar */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <div className="w-28 shrink-0 text-right">
              <div className="text-xs font-semibold text-green-700">Consensus</div>
              <div className="text-[10px] text-muted-foreground">Weighted Avg</div>
            </div>
            <div className="flex-1 relative h-7">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-5 rounded-sm bg-green-500 opacity-20"
                style={{
                  left: `${toPercent(consensusLow)}%`,
                  width: `${Math.max(toPercent(consensusHigh) - toPercent(consensusLow), 0.5)}%`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-6 rounded-sm bg-green-600"
                style={{ left: `${toPercent(consensusFairValue)}%`, transform: "translate(-50%, -50%)" }}
              />
            </div>
            <div className="w-16 shrink-0 text-right">
              <span className="text-xs font-mono font-semibold text-green-700">
                ${consensusFairValue.toFixed(0)}
              </span>
            </div>
          </div>
        </div>

        {/* X-axis ticks */}
        <div className="relative h-4 text-[10px] text-muted-foreground font-mono">
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const val = minVal + pct * range;
            return (
              <span
                key={pct}
                className="absolute -translate-x-1/2"
                style={{ left: `${pct * 100}%` }}
              >
                ${val.toFixed(0)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
