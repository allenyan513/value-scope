"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationResult } from "@/types";
import { formatLargeNumber } from "@/lib/format";

const MODEL_NAMES: Record<string, string> = {
  dcf_growth_exit_5y: "DCF Valuation",
  dcf_3stage: "DCF Perpetual Growth",
  dcf_pe_exit_10y: "DCF P/E Exit",
  dcf_ebitda_exit_fcfe_10y: "DCF EV/EBITDA Exit",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peg: "PEG Fair Value",
};

interface Props {
  model: ValuationResult;
  currentPrice: number;
}

export function ModelCard({ model, currentPrice }: Props) {
  const isNA = model.fair_value === 0;
  const naNote = (model.assumptions as Record<string, unknown>)?.note as string | undefined;
  void currentPrice;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
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
                          {model.model_type === "pe_multiples"
                            ? "P/E"
                            : model.model_type === "ev_ebitda_multiples"
                              ? "EV/EBITDA"
                              : "Multiple"}
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

          {/* PEG: Earnings history */}
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
                              ? row.yoy_growth > 0 ? "text-green-400" : "text-red-400"
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
