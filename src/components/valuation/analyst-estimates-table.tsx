"use client";

import { Card } from "@/components/ui/card";
import type { AnalystEstimate } from "@/types";

function formatLargeNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

interface Props {
  estimates: AnalystEstimate[];
  currentPrice: number;
}

export function AnalystEstimatesTable({ estimates, currentPrice }: Props) {
  if (estimates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No analyst estimates available for this company.
      </p>
    );
  }

  // Sort by period ascending
  const sorted = [...estimates].sort((a, b) =>
    a.period.localeCompare(b.period)
  );

  return (
    <div className="space-y-8">
      {/* Revenue Estimates */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">Revenue Estimates</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Period</th>
                <th className="text-right p-2 font-medium">Consensus</th>
                <th className="text-right p-2 font-medium">Low</th>
                <th className="text-right p-2 font-medium">High</th>
                <th className="text-right p-2 font-medium">Analysts</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((est) => (
                <tr key={`rev-${est.period}`} className="border-b">
                  <td className="p-2 font-medium">{est.period}</td>
                  <td className="p-2 text-right font-mono">
                    {formatLargeNumber(est.revenue_estimate)}
                  </td>
                  <td className="p-2 text-right font-mono text-muted-foreground">
                    {formatLargeNumber(est.revenue_low)}
                  </td>
                  <td className="p-2 text-right font-mono text-muted-foreground">
                    {formatLargeNumber(est.revenue_high)}
                  </td>
                  <td className="p-2 text-right">{est.number_of_analysts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* EPS Estimates */}
      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-4">EPS Estimates</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Period</th>
                <th className="text-right p-2 font-medium">Consensus</th>
                <th className="text-right p-2 font-medium">Low</th>
                <th className="text-right p-2 font-medium">High</th>
                <th className="text-right p-2 font-medium">Implied P/E</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((est) => {
                const impliedPE =
                  est.eps_estimate > 0
                    ? currentPrice / est.eps_estimate
                    : null;
                return (
                  <tr key={`eps-${est.period}`} className="border-b">
                    <td className="p-2 font-medium">{est.period}</td>
                    <td className="p-2 text-right font-mono">
                      ${est.eps_estimate.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-mono text-muted-foreground">
                      ${est.eps_low.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-mono text-muted-foreground">
                      ${est.eps_high.toFixed(2)}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {impliedPE ? `${impliedPE.toFixed(1)}x` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
