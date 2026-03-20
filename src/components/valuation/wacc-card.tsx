"use client";

import { Card } from "@/components/ui/card";
import type { WACCResult } from "@/types";

interface Props {
  wacc: WACCResult;
}

export function WACCCard({ wacc }: Props) {
  const rows = [
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
  ];

  return (
    <Card className="p-6">
      <h3 className="font-semibold text-lg mb-4">
        WACC — Weighted Average Cost of Capital
      </h3>
      <div className="text-3xl font-bold text-primary mb-6">
        {(wacc.wacc * 100).toFixed(2)}%
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
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
        Ke = Rf + Beta x ERP + Additional Risk. WACC = Ke x E/(D+E) + Kd x (1-t) x D/(D+E).
      </p>
    </Card>
  );
}
