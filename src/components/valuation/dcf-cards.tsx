"use client";

import { useState, useMemo } from "react";
import type { ValuationResult } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";
import { ValuationHero } from "./valuation-hero";
import { formatMillions, getUpsideColor } from "@/lib/format";

/** Highlight key data in narrative: $amounts, percentages, multiples, verdict words */
function highlightNarrative(text: string): React.ReactNode[] {
  // Match: $123.45, 24.5%, 37.4x, "undervalued", "overvalued", "fairly valued"
  const pattern = /(\$[\d,.]+[TB]?|\d+(?:\.\d+)?%|\d+(?:\.\d+)?x|undervalued|overvalued|fairly valued)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const value = match[0];
    const isVerdict = value === "undervalued" || value === "overvalued" || value === "fairly valued";
    parts.push(
      <span
        key={match.index}
        className={
          isVerdict
            ? "font-semibold text-foreground"
            : "font-semibold text-foreground tabular-nums"
        }
      >
        {value}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}


// --- Parameter Input Component ---
function ParamInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  return (
    <div className="text-center p-4 rounded-xl border border-border/60 bg-muted/30">
      <div className="text-sm text-muted-foreground mb-2">{label}</div>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => onChange(clamp(value - step))}
          className="w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="text-xl font-bold font-mono min-w-[5rem]">
          {value.toFixed(step < 1 ? 2 : 0)}{suffix}
        </span>
        <button
          onClick={() => onChange(clamp(value + step))}
          className="w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1.5">
        {min}{suffix} – {max}{suffix}
      </div>
    </div>
  );
}

interface Props {
  model: ValuationResult;
  currentPrice: number;
  narrative?: string;
}

export function DCFCards({ model, currentPrice, narrative }: Props) {
  const details = model.details as Record<string, unknown>;
  const assumptions = model.assumptions as Record<string, unknown>;

  const projections = details.projections as Array<{
    year: number;
    revenue: number;
    net_margin: number;
    net_income: number;
    depreciation_amortization: number;
    capital_expenditure: number;
    fcfe: number;
    pv_fcfe: number;
    stage?: 1 | 2;
    ebitda?: number;
    /** @deprecated */ net_capex?: number;
  }>;

  const isThreeStage = projections.some((p) => p.stage !== undefined);
  const terminalMethod = assumptions.terminal_method as string | undefined;
  const isExitMultiple = terminalMethod === "pe_exit" || terminalMethod === "ebitda_exit";
  const isPEExit = terminalMethod === "pe_exit";
  const isEBITDAExit = terminalMethod === "ebitda_exit";

  const cashAndEquiv = details.cash_and_equivalents as number;
  const totalDebt = details.total_debt as number;
  const sharesOut = details.shares_outstanding as number;

  // Server defaults
  const defaultDiscountRate = assumptions.discount_rate as number;
  const defaultTerminalGrowth = assumptions.terminal_growth_rate as number;
  const defaultForecastYears = projections.length;
  const defaultExitMultiple = isPEExit
    ? (assumptions.exit_pe as number)
    : isEBITDAExit
      ? (assumptions.exit_ev_ebitda as number)
      : 0;

  // Interactive state
  const [discountRate, setDiscountRate] = useState(defaultDiscountRate);
  const [terminalGrowth, setTerminalGrowth] = useState(defaultTerminalGrowth);
  const [forecastYears, setForecastYears] = useState(defaultForecastYears);
  const [exitMultiple, setExitMultiple] = useState(defaultExitMultiple);

  const isCustom = isExitMultiple
    ? discountRate !== defaultDiscountRate || exitMultiple !== defaultExitMultiple
    : discountRate !== defaultDiscountRate ||
      terminalGrowth !== defaultTerminalGrowth ||
      forecastYears !== defaultForecastYears;

  const resetDefaults = () => {
    setDiscountRate(defaultDiscountRate);
    setTerminalGrowth(defaultTerminalGrowth);
    setForecastYears(defaultForecastYears);
    setExitMultiple(defaultExitMultiple);
  };

  // Recalculate when parameters change
  const calc = useMemo(() => {
    const ke = discountRate / 100;
    const g = terminalGrowth / 100;
    const active = projections.slice(0, forecastYears);
    const n = active.length;

    const rows = active.map((p, i) => {
      const t = i + 1;
      const discountFactor = 1 / Math.pow(1 + ke, t);
      const pvFcfe = p.fcfe * discountFactor;
      return { ...p, discount_factor: discountFactor, pv_fcfe: pvFcfe };
    });

    const lastRow = rows[n - 1];

    // Terminal value depends on method
    let terminalValue: number;
    if (isPEExit) {
      // P/E Exit: TV = Year N Net Income × Exit P/E
      terminalValue = lastRow.net_income * exitMultiple;
    } else if (isEBITDAExit) {
      // EV/EBITDA Exit: TV_EV = Year N EBITDA × Exit EV/EBITDA, minus net debt for equity
      const year10EBITDA = lastRow.ebitda ?? 0;
      const netDebt = totalDebt - cashAndEquiv;
      const termEV = year10EBITDA * exitMultiple;
      terminalValue = Math.max(0, termEV - netDebt);
    } else {
      // Gordon Growth perpetuity
      const lastFCFE = lastRow.fcfe;
      terminalValue = ke > g ? (lastFCFE * (1 + g)) / (ke - g) : lastFCFE * 20;
    }

    const pvTerminal = terminalValue / Math.pow(1 + ke, n);
    const pvFCFETotal = rows.reduce((sum, p) => sum + p.pv_fcfe, 0);
    const totalPV = pvFCFETotal + pvTerminal;
    const equityVal = totalPV + cashAndEquiv - totalDebt;
    const fairVal = Math.max(0, equityVal / sharesOut);
    const upsidePercent = ((fairVal - currentPrice) / currentPrice) * 100;

    // Terminal year derived values (for perpetuity display)
    const termRevenue = lastRow.revenue * (1 + g);
    const termNetIncome = termRevenue * lastRow.net_margin;
    const termDA = lastRow.revenue > 0 ? termRevenue * (lastRow.depreciation_amortization / lastRow.revenue) : 0;
    const termCapex = lastRow.revenue > 0 ? termRevenue * (lastRow.capital_expenditure / lastRow.revenue) : 0;
    const termFCFE = termNetIncome + termDA - termCapex;
    const termYear = lastRow.year + 1;

    const keLeG = !isExitMultiple && ke <= g;

    return {
      rows,
      pvTerminal,
      pvFCFETotal,
      totalPV,
      equityValue: equityVal,
      fairValue: fairVal,
      upsidePercent,
      termRevenue,
      termNetIncome,
      termDA,
      termCapex,
      termFCFE,
      termYear,
      keLeG,
    };
  }, [discountRate, terminalGrowth, exitMultiple, forecastYears, projections, cashAndEquiv, totalDebt, sharesOut, currentPrice, isPEExit, isEBITDAExit, isExitMultiple]);

  const colSpan = calc.rows.length + 2;

  // Sensitivity matrix
  const sm = details.sensitivity_matrix as Record<string, unknown>;
  const discountRateValues = (sm.discount_rate_values ?? sm.wacc_values) as number[];
  const growthValues = sm.growth_values as number[];
  const prices = sm.prices as number[][];

  return (
    <div className="space-y-6">
      {/* ===== Card 1: DCF Value — stats + narrative ===== */}
      <ValuationHero
        fairValue={calc.fairValue}
        currentPrice={currentPrice}
        upside={calc.upsidePercent}
        customLabel={isCustom ? <span className="text-amber-400 normal-case ml-1">(custom)</span> : undefined}
        narrative={narrative ? highlightNarrative(narrative) : undefined}
      />

      {/* ===== Card 2: Present Value Calculation ===== */}
      <div className="val-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="val-card-title">Present Value Calculation</h3>
            {isCustom && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400">
                Modified
              </span>
            )}
          </div>
          {isCustom && (
            <button
              onClick={resetDefaults}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Reset to Default
            </button>
          )}
        </div>

        {/* Interactive Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
          <ParamInput
            label="Discount Rate"
            value={discountRate}
            onChange={setDiscountRate}
            min={1}
            max={25}
            step={0.25}
            suffix="%"
          />
          {isExitMultiple ? (
            <ParamInput
              label={isPEExit ? "Exit P/E" : "Exit EV/EBITDA"}
              value={exitMultiple}
              onChange={setExitMultiple}
              min={5}
              max={60}
              step={0.5}
              suffix="x"
            />
          ) : (
            <ParamInput
              label="Terminal Growth"
              value={terminalGrowth}
              onChange={setTerminalGrowth}
              min={0}
              max={6}
              step={0.25}
              suffix="%"
            />
          )}
          {!isThreeStage ? (
            <ParamInput
              label="Forecast Period"
              value={forecastYears}
              onChange={setForecastYears}
              min={3}
              max={defaultForecastYears}
              step={1}
              suffix=" Yrs"
            />
          ) : (
            <div className="text-center p-4 rounded-xl border border-border/60 bg-muted/30">
              <div className="text-sm text-muted-foreground mb-2">Forecast Period</div>
              <div className="text-xl font-bold font-mono">10 Yrs</div>
              <div className="text-[11px] text-muted-foreground mt-1.5">Stage 1 (5Y) + Stage 2 (5Y)</div>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-6 text-center">
          Adjust parameters to explore scenarios. Changes are for exploration only and do not affect saved valuations.
        </p>

        {/* Warning for ke <= g */}
        {calc.keLeG && (
          <div className="mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-800 text-sm text-amber-300">
            Discount rate must be greater than terminal growth for a meaningful terminal value. Using fallback multiplier.
          </div>
        )}

        {/* Projection Table */}
        <div className="overflow-x-auto">
          <div className="flex justify-end mb-2">
            <span className="text-xs text-muted-foreground">Currency: USD &nbsp; Millions</span>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              {isThreeStage && (
                <tr className="border-b">
                  <th className="p-1.5"></th>
                  <th
                    colSpan={5}
                    className="text-center p-1.5 text-[11px] font-semibold bg-blue-950/30 text-blue-400 border-r border-border/60"
                  >
                    Stage 1 — Analyst Estimates
                  </th>
                  <th
                    colSpan={5}
                    className="text-center p-1.5 text-[11px] font-semibold bg-violet-950/30 text-violet-400 border-r border-border/60"
                  >
                    Stage 2 — Transition
                  </th>
                  <th className="text-center p-1.5 text-[11px] font-semibold bg-muted/50 text-muted-foreground">
                    Terminal
                  </th>
                </tr>
              )}
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2.5 font-semibold text-sm"></th>
                {calc.rows.map((p) => (
                  <th
                    key={p.year}
                    className={`text-right p-2.5 font-semibold text-sm ${
                      isThreeStage && p.stage === 2
                        ? "bg-violet-950/20"
                        : ""
                    }`}
                  >
                    <div>{p.year}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">
                      {isThreeStage ? (p.stage === 1 ? "analyst" : "transition") : "forecast"}
                    </div>
                  </th>
                ))}
                <th className="text-right p-2.5 font-semibold text-sm">
                  <div>{calc.termYear}+</div>
                  <div className="text-[10px] text-muted-foreground font-normal">terminal</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium">Revenue</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{formatMillions(p.revenue)}</td>
                ))}
                <td className="p-2.5 text-right font-mono">{formatMillions(calc.termRevenue)}</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium">Net Margin</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{(p.net_margin * 100).toFixed(1)}%</td>
                ))}
                <td className="p-2.5 text-right font-mono">{(calc.rows[calc.rows.length - 1].net_margin * 100).toFixed(1)}%</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium text-blue-400">Net Income</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono font-semibold text-blue-400 ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{formatMillions(p.net_income)}</td>
                ))}
                <td className="p-2.5 text-right font-mono font-semibold text-blue-400">{formatMillions(calc.termNetIncome)}</td>
              </tr>
              <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium text-muted-foreground">(+) D&amp;A</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono text-muted-foreground ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{formatMillions(p.depreciation_amortization)}</td>
                ))}
                <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(calc.termDA)}</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium text-muted-foreground">(&minus;) CapEx</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono text-muted-foreground ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{formatMillions(p.capital_expenditure)}</td>
                ))}
                <td className="p-2.5 text-right font-mono text-muted-foreground">{formatMillions(calc.termCapex)}</td>
              </tr>
              <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-bold text-blue-400">FCFE</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono font-bold text-blue-400 ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{formatMillions(p.fcfe)}</td>
                ))}
                <td className="p-2.5 text-right font-mono font-bold text-blue-400">{formatMillions(calc.termFCFE)}</td>
              </tr>
              <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium text-muted-foreground">Discount Rate</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono text-muted-foreground ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{discountRate.toFixed(2)}%</td>
                ))}
                <td className="p-2.5 text-right font-mono text-muted-foreground">{discountRate.toFixed(2)}%</td>
              </tr>
              <tr className="border-b bg-primary/5">
                <td className="p-2.5 font-bold">Present Value</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className={`p-2.5 text-right font-mono font-bold ${isThreeStage && p.stage === 2 ? "bg-violet-950/10" : ""}`}>{formatMillions(p.pv_fcfe)}</td>
                ))}
                <td className="p-2.5 text-right font-mono font-bold">{formatMillions(calc.pvTerminal)}</td>
              </tr>

              {/* Bridge */}
              <tr><td colSpan={colSpan} className="h-5"></td></tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium">Present Value of Cash Flows</td>
                <td colSpan={calc.rows.length + 1} className="p-2.5 text-right font-mono font-semibold">{formatMillions(calc.totalPV)}</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 text-muted-foreground">+ Cash &amp; Equivalents</td>
                <td colSpan={calc.rows.length + 1} className="p-2.5 text-right font-mono">{formatMillions(cashAndEquiv)}</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 text-muted-foreground">− Total Debt</td>
                <td colSpan={calc.rows.length + 1} className="p-2.5 text-right font-mono">{formatMillions(totalDebt)}</td>
              </tr>
              <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-semibold">Equity Value</td>
                <td colSpan={calc.rows.length + 1} className="p-2.5 text-right font-mono font-semibold">{formatMillions(calc.equityValue)}</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 text-muted-foreground">÷ Shares Outstanding</td>
                <td colSpan={calc.rows.length + 1} className="p-2.5 text-right font-mono">{formatMillions(sharesOut)}</td>
              </tr>
              <tr className="bg-primary/5 rounded-b-lg">
                <td className="p-3 font-bold text-base">DCF Fair Value</td>
                <td colSpan={calc.rows.length + 1} className={`p-3 text-right font-mono font-bold text-lg ${getUpsideColor(calc.upsidePercent)}`}>
                  ${calc.fairValue.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Card 3: Sensitivity Analysis ===== */}
      <div className="val-card">
        <h3 className="val-card-title">Sensitivity Analysis</h3>
        <SensitivityHeatmap
          waccValues={discountRateValues}
          secondAxisValues={growthValues}
          prices={prices}
          currentPrice={currentPrice}
          xLabel={isExitMultiple ? "Exit Multiple" : "Terminal Growth Rate"}
          isPercent={!isExitMultiple}
        />
      </div>

    </div>
  );
}
