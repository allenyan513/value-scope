"use client";

import { Card } from "@/components/ui/card";
import type { ValuationResult, WACCResult } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";

/** Format number in millions (e.g., 125000000 → "125,000") */
function formatMillions(n: number): string {
  const inMillions = n / 1e6;
  return inMillions.toLocaleString(undefined, { maximumFractionDigits: 0 });
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

  const pvTerminal = details.pv_terminal_value as number;
  const pvFCFETotal = details.pv_fcfe_total as number;
  const cashAndEquiv = details.cash_and_equivalents as number;
  const totalDebt = details.total_debt as number;
  const equityValue = details.equity_value as number;
  const sharesOut = details.shares_outstanding as number;
  const totalPV = pvFCFETotal + pvTerminal;

  // Terminal year projection
  const lastProj = projections[projections.length - 1];
  const termGrowth = (assumptions.terminal_growth_rate as number) / 100;
  const termRevenue = lastProj.revenue * (1 + termGrowth);
  const termNetIncome = termRevenue * lastProj.net_margin;
  const termCapex = termRevenue * (lastProj.net_capex / lastProj.revenue);
  const termFCFE = termNetIncome - termCapex;

  const colSpan = projections.length + 2;

  // Sensitivity matrix
  const sm = details.sensitivity_matrix as Record<string, unknown>;
  const discountRateValues = (sm.discount_rate_values ?? sm.wacc_values) as number[];
  const growthValues = sm.growth_values as number[];
  const prices = sm.prices as number[][];

  const upsideColor =
    model.upside_percent > 15
      ? "text-green-600 dark:text-green-400"
      : model.upside_percent < -15
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";

  return (
    <div className="space-y-6">
      {/* ===== Card 1: DCF Value ===== */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">DCF Value</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Current Price</div>
            <div className="text-2xl font-bold font-mono">${currentPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Fair Value</div>
            <div className="text-2xl font-bold font-mono">${model.fair_value.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Range</div>
            <div className="text-lg font-medium font-mono text-muted-foreground">
              ${model.low_estimate.toFixed(2)} – ${model.high_estimate.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Upside</div>
            <div className={`text-2xl font-bold font-mono ${upsideColor}`}>
              {model.upside_percent > 0 ? "+" : ""}{model.upside_percent.toFixed(1)}%
            </div>
          </div>
        </div>
      </Card>

      {/* ===== Card 2: Present Value Calculation ===== */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Present Value Calculation</h3>

        {/* Parameters */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Discount Rate", value: `${(assumptions.discount_rate as number).toFixed(2)}%` },
            { label: "Terminal Growth", value: `${(assumptions.terminal_growth_rate as number).toFixed(2)}%` },
            { label: "Forecast Period", value: `${assumptions.projection_years} Years` },
          ].map((item) => (
            <div key={item.label} className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground mb-1">{item.label}</div>
              <div className="text-xl font-bold font-mono">{item.value}</div>
            </div>
          ))}
        </div>

        {/* Projection Table */}
        <div className="overflow-x-auto">
          <div className="flex justify-end mb-2">
            <span className="text-xs text-muted-foreground">Currency: USD &nbsp; Millions</span>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2 font-medium"></th>
                {projections.map((p, i) => (
                  <th key={p.year} className="text-right p-2 font-medium">
                    <div>Year {i + 1}</div>
                    <div className="text-[10px] text-muted-foreground font-normal">forecasted</div>
                  </th>
                ))}
                <th className="text-right p-2 font-medium">
                  <div>Terminal</div>
                  <div className="text-[10px] text-muted-foreground font-normal">forecasted</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-2 font-medium">Revenue</td>
                {projections.map((p) => (
                  <td key={p.year} className="p-2 text-right font-mono">{formatMillions(p.revenue)}</td>
                ))}
                <td className="p-2 text-right font-mono">{formatMillions(termRevenue)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Net Margin</td>
                {projections.map((p) => (
                  <td key={p.year} className="p-2 text-right font-mono">{(p.net_margin * 100).toFixed(2)}%</td>
                ))}
                <td className="p-2 text-right font-mono">{(lastProj.net_margin * 100).toFixed(2)}%</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium text-blue-700 dark:text-blue-400">Net Income</td>
                {projections.map((p) => (
                  <td key={p.year} className="p-2 text-right font-mono font-semibold text-blue-700 dark:text-blue-400">{formatMillions(p.net_income)}</td>
                ))}
                <td className="p-2 text-right font-mono font-semibold text-blue-700 dark:text-blue-400">{formatMillions(termNetIncome)}</td>
              </tr>
              <tr><td colSpan={colSpan} className="h-2"></td></tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Net CapEx</td>
                {projections.map((p) => (
                  <td key={p.year} className="p-2 text-right font-mono">{formatMillions(p.net_capex)}</td>
                ))}
                <td className="p-2 text-right font-mono">{formatMillions(termCapex)}</td>
              </tr>
              <tr className="border-b border-t-2 border-t-foreground/20">
                <td className="p-2 font-bold text-blue-700 dark:text-blue-400">FCFE</td>
                {projections.map((p) => (
                  <td key={p.year} className="p-2 text-right font-mono font-bold text-blue-700 dark:text-blue-400">{formatMillions(p.fcfe)}</td>
                ))}
                <td className="p-2 text-right font-mono font-bold text-blue-700 dark:text-blue-400">{formatMillions(termFCFE)}</td>
              </tr>
              <tr><td colSpan={colSpan} className="h-2"></td></tr>
              <tr className="border-b bg-muted/30">
                <td className="p-2 font-bold">Present Value</td>
                {projections.map((p) => (
                  <td key={p.year} className="p-2 text-right font-mono font-bold">{formatMillions(p.pv_fcfe)}</td>
                ))}
                <td className="p-2 text-right font-mono font-bold">{formatMillions(pvTerminal)}</td>
              </tr>

              {/* Bridge */}
              <tr><td colSpan={colSpan} className="h-4"></td></tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Present Value</td>
                <td colSpan={projections.length + 1} className="p-2 text-right font-mono font-semibold">{formatMillions(totalPV)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 text-muted-foreground">+ Cash &amp; Equivalents</td>
                <td colSpan={projections.length + 1} className="p-2 text-right font-mono">{formatMillions(cashAndEquiv)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 text-muted-foreground">- Total Debt</td>
                <td colSpan={projections.length + 1} className="p-2 text-right font-mono">{formatMillions(totalDebt)}</td>
              </tr>
              <tr className="border-b border-t-2 border-t-foreground/20">
                <td className="p-2 font-semibold">Equity Value</td>
                <td colSpan={projections.length + 1} className="p-2 text-right font-mono font-semibold">{formatMillions(equityValue)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 text-muted-foreground">/ Shares Outstanding</td>
                <td colSpan={projections.length + 1} className="p-2 text-right font-mono">{formatMillions(sharesOut)}</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="p-2 font-bold text-base">DCF Value</td>
                <td colSpan={projections.length + 1} className="p-2 text-right font-mono font-bold text-base">${model.fair_value.toFixed(2)}</td>
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
              className={`flex justify-between py-1.5 px-2 rounded text-sm ${
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
