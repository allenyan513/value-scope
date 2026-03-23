"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import type { ValuationResult, WACCResult } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";

/** Format number in millions (e.g., 125000000 → "125,000") */
function formatMillions(n: number): string {
  const inMillions = n / 1e6;
  return inMillions.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getUpsideColor(upside: number) {
  if (upside > 15) return "text-green-600 dark:text-green-400";
  if (upside < -15) return "text-red-600 dark:text-red-400";
  return "text-foreground";
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
  wacc: WACCResult;
}

export function DCFCards({ model, currentPrice, wacc }: Props) {
  const details = model.details as Record<string, unknown>;
  const assumptions = model.assumptions as Record<string, unknown>;

  const projections = details.projections as Array<{
    year: number;
    revenue: number;
    net_margin: number;
    net_income: number;
    net_capex: number;
    fcfe: number;
    pv_fcfe: number;
  }>;

  const cashAndEquiv = details.cash_and_equivalents as number;
  const totalDebt = details.total_debt as number;
  const sharesOut = details.shares_outstanding as number;

  // Server defaults
  const defaultDiscountRate = assumptions.discount_rate as number;
  const defaultTerminalGrowth = assumptions.terminal_growth_rate as number;
  const defaultForecastYears = projections.length;

  // Interactive state
  const [discountRate, setDiscountRate] = useState(defaultDiscountRate);
  const [terminalGrowth, setTerminalGrowth] = useState(defaultTerminalGrowth);
  const [forecastYears, setForecastYears] = useState(defaultForecastYears);

  const isCustom =
    discountRate !== defaultDiscountRate ||
    terminalGrowth !== defaultTerminalGrowth ||
    forecastYears !== defaultForecastYears;

  const resetDefaults = () => {
    setDiscountRate(defaultDiscountRate);
    setTerminalGrowth(defaultTerminalGrowth);
    setForecastYears(defaultForecastYears);
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

    const lastFCFE = rows[n - 1].fcfe;
    const terminalValue = ke > g ? (lastFCFE * (1 + g)) / (ke - g) : lastFCFE * 20;
    const pvTerminal = terminalValue / Math.pow(1 + ke, n);
    const pvFCFETotal = rows.reduce((sum, p) => sum + p.pv_fcfe, 0);
    const totalPV = pvFCFETotal + pvTerminal;
    const equityVal = totalPV + cashAndEquiv - totalDebt;
    const fairVal = Math.max(0, equityVal / sharesOut);
    const upsidePercent = ((fairVal - currentPrice) / currentPrice) * 100;

    // Terminal year derived values
    const lastRow = rows[n - 1];
    const termRevenue = lastRow.revenue * (1 + g);
    const termNetIncome = termRevenue * lastRow.net_margin;
    const termCapex = termRevenue * (lastRow.net_capex / lastRow.revenue);
    const termFCFE = termNetIncome - termCapex;
    const termYear = lastRow.year + 1;

    const keLeG = ke <= g;

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
      termCapex,
      termFCFE,
      termYear,
      keLeG,
    };
  }, [discountRate, terminalGrowth, forecastYears, projections, cashAndEquiv, totalDebt, sharesOut, currentPrice]);

  const colSpan = calc.rows.length + 2;

  // Sensitivity matrix
  const sm = details.sensitivity_matrix as Record<string, unknown>;
  const discountRateValues = (sm.discount_rate_values ?? sm.wacc_values) as number[];
  const growthValues = sm.growth_values as number[];
  const prices = sm.prices as number[][];

  return (
    <div className="space-y-6">
      {/* ===== Card 1: DCF Value ===== */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <h3 className="font-semibold text-lg">DCF Value</h3>
          {isCustom && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              Custom Scenario
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Current Price</div>
            <div className="text-2xl font-bold font-mono">${currentPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Fair Value</div>
            <div className="text-2xl font-bold font-mono">${calc.fairValue.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Range</div>
            <div className="text-lg font-medium font-mono text-muted-foreground">
              ${model.low_estimate.toFixed(2)} – ${model.high_estimate.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Upside</div>
            <div className={`text-2xl font-bold font-mono ${getUpsideColor(calc.upsidePercent)}`}>
              {calc.upsidePercent > 0 ? "+" : ""}{calc.upsidePercent.toFixed(1)}%
            </div>
          </div>
        </div>
      </Card>

      {/* ===== Card 2: Present Value Calculation ===== */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg">Present Value Calculation</h3>
            {isCustom && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
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
          <ParamInput
            label="Terminal Growth"
            value={terminalGrowth}
            onChange={setTerminalGrowth}
            min={0}
            max={6}
            step={0.25}
            suffix="%"
          />
          <ParamInput
            label="Forecast Period"
            value={forecastYears}
            onChange={setForecastYears}
            min={3}
            max={defaultForecastYears}
            step={1}
            suffix=" Yrs"
          />
        </div>
        <p className="text-xs text-muted-foreground mb-6 text-center">
          Adjust parameters to explore scenarios. Changes are for exploration only and do not affect saved valuations.
        </p>

        {/* Warning for ke <= g */}
        {calc.keLeG && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
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
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2.5 font-semibold text-sm"></th>
                {calc.rows.map((p) => (
                  <th key={p.year} className="text-right p-2.5 font-semibold text-sm">
                    <div>{p.year}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">forecast</div>
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
                  <td key={p.year} className="p-2.5 text-right font-mono">{formatMillions(p.revenue)}</td>
                ))}
                <td className="p-2.5 text-right font-mono">{formatMillions(calc.termRevenue)}</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium">Net Margin</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className="p-2.5 text-right font-mono">{(p.net_margin * 100).toFixed(1)}%</td>
                ))}
                <td className="p-2.5 text-right font-mono">{(calc.rows[calc.rows.length - 1].net_margin * 100).toFixed(1)}%</td>
              </tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium text-blue-700 dark:text-blue-400">Net Income</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className="p-2.5 text-right font-mono font-semibold text-blue-700 dark:text-blue-400">{formatMillions(p.net_income)}</td>
                ))}
                <td className="p-2.5 text-right font-mono font-semibold text-blue-700 dark:text-blue-400">{formatMillions(calc.termNetIncome)}</td>
              </tr>
              <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium">Net CapEx</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className="p-2.5 text-right font-mono">{formatMillions(p.net_capex)}</td>
                ))}
                <td className="p-2.5 text-right font-mono">{formatMillions(calc.termCapex)}</td>
              </tr>
              <tr className="border-b border-t-2 border-t-foreground/20 hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-bold text-blue-700 dark:text-blue-400">FCFE</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className="p-2.5 text-right font-mono font-bold text-blue-700 dark:text-blue-400">{formatMillions(p.fcfe)}</td>
                ))}
                <td className="p-2.5 text-right font-mono font-bold text-blue-700 dark:text-blue-400">{formatMillions(calc.termFCFE)}</td>
              </tr>
              <tr><td colSpan={colSpan} className="h-1.5"></td></tr>
              <tr className="border-b hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-medium text-muted-foreground">Discount Rate</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className="p-2.5 text-right font-mono text-muted-foreground">{discountRate.toFixed(2)}%</td>
                ))}
                <td className="p-2.5 text-right font-mono text-muted-foreground">{discountRate.toFixed(2)}%</td>
              </tr>
              <tr className="border-b bg-primary/5">
                <td className="p-2.5 font-bold">Present Value</td>
                {calc.rows.map((p) => (
                  <td key={p.year} className="p-2.5 text-right font-mono font-bold">{formatMillions(p.pv_fcfe)}</td>
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
      </Card>

      {/* ===== Card 3: Sensitivity Analysis ===== */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Sensitivity Analysis</h3>
        <SensitivityHeatmap
          waccValues={discountRateValues}
          secondAxisValues={growthValues}
          prices={prices}
          currentPrice={currentPrice}
          xLabel="Terminal Growth Rate"
          isPercent={true}
        />
      </Card>

      {/* ===== Card 4: Discount Rate Breakdown ===== */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Discount Rate Breakdown</h3>
        <p className="text-sm text-muted-foreground mb-4">
          The discount rate reflects the required return on equity investment.
          A higher rate means future cash flows are worth less today.
        </p>
        <div className="space-y-1">
          {[
            { label: "Risk-Free Rate (Rf)", value: `${(wacc.risk_free_rate * 100).toFixed(2)}%` },
            { label: "Beta", value: wacc.beta.toFixed(2) },
            { label: "Equity Risk Premium (ERP)", value: `${(wacc.erp * 100).toFixed(1)}%` },
            { label: "Additional Risk Premium", value: `${(wacc.additional_risk_premium * 100).toFixed(1)}%` },
            { label: "Cost of Equity (Ke)", value: `${(wacc.cost_of_equity * 100).toFixed(2)}%`, highlight: true },
            { label: "Cost of Debt (Kd)", value: `${(wacc.cost_of_debt * 100).toFixed(2)}%` },
            { label: "Tax Rate", value: `${(wacc.tax_rate * 100).toFixed(1)}%` },
            { label: "After-tax Cost of Debt", value: `${(wacc.cost_of_debt * (1 - wacc.tax_rate) * 100).toFixed(2)}%` },
            { label: "Equity Weight", value: `${(wacc.equity_weight * 100).toFixed(1)}%` },
            { label: "Debt Weight", value: `${(wacc.debt_weight * 100).toFixed(1)}%` },
            { label: "WACC", value: `${(wacc.wacc * 100).toFixed(2)}%`, highlight: true },
          ].map((row) => (
            <div
              key={row.label}
              className={`flex justify-between py-2 px-3 rounded text-sm ${
                row.highlight ? "bg-primary/5 font-medium" : ""
              }`}
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-mono">{row.value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Ke = Rf + Beta × ERP + Additional Risk. WACC = Ke × E/(D+E) + Kd × (1-t) × D/(D+E).
        </p>
      </Card>
    </div>
  );
}
