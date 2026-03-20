"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationResult, ModelApplicability } from "@/types";
import { SensitivityHeatmap } from "./sensitivity-heatmap";
import { TVBreakdown } from "./tv-breakdown";

const MODEL_NAMES: Record<string, string> = {
  dcf_growth_exit_5y: "DCF — Growth Exit (5Y)",
  dcf_growth_exit_10y: "DCF — Growth Exit (10Y)",
  dcf_ebitda_exit_5y: "DCF — EBITDA Exit (5Y)",
  dcf_ebitda_exit_10y: "DCF — EBITDA Exit (10Y)",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peter_lynch: "Peter Lynch Fair Value",
};

const ROLE_STYLES: Record<string, { border: string; label: string }> = {
  primary: { border: "border-l-4 border-l-blue-500", label: "Primary Model" },
  cross_check: { border: "border-l-4 border-l-slate-400", label: "Cross-Check" },
  sanity_check: { border: "border-l-4 border-l-slate-300", label: "Sanity Check" },
  not_applicable: { border: "border-l-4 border-l-slate-200", label: "Not Applicable" },
};

function formatLargeNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

interface Props {
  model: ValuationResult;
  currentPrice: number;
  applicability?: ModelApplicability;
}

export function ModelCard({ model, currentPrice, applicability }: Props) {
  const isNA = model.fair_value === 0;
  const naNote = (model.assumptions as Record<string, unknown>)?.note as string | undefined;
  const role = applicability?.role ?? "cross_check";
  const roleStyle = ROLE_STYLES[role] ?? ROLE_STYLES.cross_check;
  const isDCF = model.model_type.startsWith("dcf_");

  return (
    <Card className={`p-6 ${roleStyle.border}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-lg">
          {MODEL_NAMES[model.model_type] ?? model.model_type}
        </h3>
        {!isNA && (
          <Badge variant={model.upside_percent > 0 ? "default" : "destructive"}>
            {model.upside_percent > 0 ? "+" : ""}
            {model.upside_percent.toFixed(1)}%
          </Badge>
        )}
      </div>

      {/* Role + confidence tag */}
      {applicability && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
            {roleStyle.label}
          </span>
          {applicability.confidence && (
            <Badge
              variant="outline"
              className={`text-[10px] ${
                applicability.confidence === "high"
                  ? "border-green-300 text-green-700"
                  : applicability.confidence === "medium"
                    ? "border-amber-300 text-amber-700"
                    : "border-red-300 text-red-700"
              }`}
            >
              {applicability.confidence} confidence
            </Badge>
          )}
        </div>
      )}

      {/* Applicability reason */}
      {applicability?.reason && (
        <p className="text-xs text-muted-foreground mb-4 italic">
          {applicability.reason}
        </p>
      )}

      {isNA ? (
        <p className="text-muted-foreground text-sm">{naNote || "Not applicable for this company."}</p>
      ) : (
        <>
          {/* Fair value + range */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Fair Value</div>
              <div className="text-2xl font-bold">${model.fair_value.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Low Estimate</div>
              <div className="text-lg font-medium text-muted-foreground">
                ${model.low_estimate.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">High Estimate</div>
              <div className="text-lg font-medium text-muted-foreground">
                ${model.high_estimate.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Key assumptions */}
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-2">Key Assumptions</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {Object.entries(model.assumptions)
                .filter(([k]) => !["note"].includes(k))
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 px-2 py-1 rounded bg-muted/50">
                    <span className="text-muted-foreground truncate">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono font-medium">
                      {typeof value === "number"
                        ? value > 1e6
                          ? formatLargeNumber(value)
                          : value.toFixed(2)
                        : Array.isArray(value)
                          ? (value as number[]).map((v) => `${v.toFixed(1)}%`).join(", ")
                          : String(value)}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* DCF: TV Breakdown */}
          {isDCF && model.details && "pv_terminal_value" in model.details && (
            <div className="mb-6">
              <h4 className="text-sm font-medium mb-2">Value Composition</h4>
              <TVBreakdown
                pvFCFTotal={(model.details as Record<string, unknown>).pv_fcf_total as number}
                pvTerminalValue={(model.details as Record<string, unknown>).pv_terminal_value as number}
                enterpriseValue={(model.details as Record<string, unknown>).enterprise_value as number}
                netDebt={(model.details as Record<string, unknown>).net_debt as number}
                equityValue={(model.details as Record<string, unknown>).equity_value as number}
                fairValue={model.fair_value}
              />
            </div>
          )}

          {/* DCF: Projection table */}
          {model.details &&
            "projections" in model.details &&
            Array.isArray((model.details as Record<string, unknown>).projections) && (
              <div className="mb-6">
                <h4 className="text-sm font-medium mb-2">FCF Projections</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Year</th>
                        <th className="text-right p-2">Revenue</th>
                        <th className="text-right p-2">EBITDA</th>
                        <th className="text-right p-2">FCF</th>
                        <th className="text-right p-2">PV of FCF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        (model.details as Record<string, unknown>)
                          .projections as Array<{
                          year: number;
                          revenue: number;
                          ebitda: number;
                          fcf: number;
                          pv_fcf: number;
                        }>
                      ).map((p) => (
                        <tr key={p.year} className="border-b">
                          <td className="p-2 font-medium">{p.year}</td>
                          <td className="p-2 text-right font-mono">
                            {formatLargeNumber(p.revenue)}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {formatLargeNumber(p.ebitda)}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {formatLargeNumber(p.fcf)}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {formatLargeNumber(p.pv_fcf)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {/* Sensitivity matrix */}
          {model.details &&
            "sensitivity_matrix" in model.details &&
            (model.details as Record<string, unknown>).sensitivity_matrix && (
              <div>
                <h4 className="text-sm font-medium mb-2">Sensitivity Analysis</h4>
                <SensitivityHeatmap
                  waccValues={
                    ((model.details as Record<string, unknown>).sensitivity_matrix as Record<string, unknown>)
                      .wacc_values as number[]
                  }
                  secondAxisValues={
                    ((model.details as Record<string, unknown>).sensitivity_matrix as Record<string, unknown>)
                      .growth_values as number[]
                  }
                  prices={
                    ((model.details as Record<string, unknown>).sensitivity_matrix as Record<string, unknown>)
                      .prices as number[][]
                  }
                  currentPrice={currentPrice}
                  xLabel={
                    model.model_type.includes("ebitda_exit")
                      ? "Exit Multiple"
                      : "Terminal Growth Rate"
                  }
                  isPercent={!model.model_type.includes("ebitda_exit")}
                />
              </div>
            )}

          {/* Trading Multiples: Peer table */}
          {model.details &&
            "peers" in model.details &&
            Array.isArray((model.details as Record<string, unknown>).peers) &&
            ((model.details as Record<string, unknown>).peers as Array<Record<string, unknown>>).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Peer Comparison</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Ticker</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-right p-2">Market Cap</th>
                        <th className="text-right p-2">
                          {model.model_type === "pe_multiples" ? "P/E" : "EV/EBITDA"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        (model.details as Record<string, unknown>)
                          .peers as Array<{
                          ticker: string;
                          name: string;
                          market_cap: number;
                          trailing_pe: number | null;
                          ev_ebitda: number | null;
                        }>
                      ).map((peer) => (
                        <tr key={peer.ticker} className="border-b">
                          <td className="p-2 font-mono font-medium">{peer.ticker}</td>
                          <td className="p-2 truncate max-w-[200px]">{peer.name}</td>
                          <td className="p-2 text-right font-mono">
                            {formatLargeNumber(peer.market_cap)}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {model.model_type === "pe_multiples"
                              ? peer.trailing_pe?.toFixed(1) ?? "—"
                              : peer.ev_ebitda?.toFixed(1) ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-medium bg-muted/50">
                        <td colSpan={3} className="p-2">
                          Industry Median
                        </td>
                        <td className="p-2 text-right font-mono">
                          {(
                            (model.details as Record<string, unknown>)
                              .industry_median as number
                          ).toFixed(1)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

          {/* Peter Lynch: Earnings history */}
          {model.details &&
            "earnings_history" in model.details &&
            Array.isArray((model.details as Record<string, unknown>).earnings_history) && (
              <div>
                <h4 className="text-sm font-medium mb-2">Earnings History</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Year</th>
                        <th className="text-right p-2">Net Income</th>
                        <th className="text-right p-2">EPS</th>
                        <th className="text-right p-2">YoY Growth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        (model.details as Record<string, unknown>)
                          .earnings_history as Array<{
                          year: number;
                          net_income: number;
                          eps: number;
                          yoy_growth: number | null;
                        }>
                      ).map((row) => (
                        <tr key={row.year} className="border-b">
                          <td className="p-2 font-medium">{row.year}</td>
                          <td className="p-2 text-right font-mono">
                            {formatLargeNumber(row.net_income)}
                          </td>
                          <td className="p-2 text-right font-mono">
                            ${row.eps.toFixed(2)}
                          </td>
                          <td className={`p-2 text-right font-mono ${
                            row.yoy_growth !== null
                              ? row.yoy_growth > 0 ? "text-green-600" : "text-red-600"
                              : ""
                          }`}>
                            {row.yoy_growth !== null
                              ? `${row.yoy_growth > 0 ? "+" : ""}${row.yoy_growth.toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </>
      )}
    </Card>
  );
}
