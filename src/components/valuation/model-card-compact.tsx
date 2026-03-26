import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationResult } from "@/types";

const MODEL_NAMES: Record<string, string> = {
  dcf_growth_exit_5y: "DCF — Growth Exit (5Y)",
  dcf_growth_exit_10y: "DCF — Growth Exit (10Y)",
  dcf_ebitda_exit_5y: "DCF — EBITDA Exit (5Y)",
  dcf_ebitda_exit_10y: "DCF — EBITDA Exit (10Y)",
  dcf_3stage: "DCF — Perpetual Growth (10Y)",
  dcf_pe_exit_10y: "DCF — P/E Exit (10Y)",
  dcf_ebitda_exit_fcfe_10y: "DCF — EV/EBITDA Exit (10Y)",
  pe_multiples: "P/E Multiples",
  ev_ebitda_multiples: "EV/EBITDA Multiples",
  peg: "PEG Fair Value",
};

const MODEL_LINKS: Record<string, string> = {
  dcf_growth_exit_5y: "/valuation/dcf",
  dcf_growth_exit_10y: "/valuation/dcf",
  dcf_ebitda_exit_5y: "/valuation/dcf",
  dcf_ebitda_exit_10y: "/valuation/dcf",
  dcf_3stage: "/valuation/dcf",
  dcf_pe_exit_10y: "/valuation/dcf",
  dcf_ebitda_exit_fcfe_10y: "/valuation/dcf",
  pe_multiples: "/valuation/relative",
  ev_ebitda_multiples: "/valuation/relative",
  peg: "/valuation/peg",
};

interface Props {
  model: ValuationResult;
  ticker: string;
}

export function ModelCardCompact({ model, ticker }: Props) {
  const isNA = model.fair_value === 0;
  const href = `/${ticker}${MODEL_LINKS[model.model_type] ?? ""}`;

  return (
    <Link href={href}>
      <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm">
            {MODEL_NAMES[model.model_type] ?? model.model_type}
          </h3>
          {!isNA && (
            <Badge
              variant={model.upside_percent > 0 ? "default" : "destructive"}
              className="text-xs"
            >
              {model.upside_percent > 0 ? "+" : ""}
              {model.upside_percent.toFixed(1)}%
            </Badge>
          )}
        </div>
        {isNA ? (
          <p className="text-muted-foreground text-xs">N/A</p>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">
              ${model.fair_value.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              ${model.low_estimate.toFixed(0)} – ${model.high_estimate.toFixed(0)}
            </span>
          </div>
        )}
      </Card>
    </Link>
  );
}
