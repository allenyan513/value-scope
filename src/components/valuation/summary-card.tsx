"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ValuationSummary } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const MODEL_SHORT_NAMES: Record<string, string> = {
  dcf_growth_exit_5y: "DCF 5Y",
  dcf_growth_exit_10y: "DCF 10Y",
  dcf_ebitda_exit_5y: "EBITDA 5Y",
  dcf_ebitda_exit_10y: "EBITDA 10Y",
  pe_multiples: "P/E",
  ev_ebitda_multiples: "EV/EBITDA",
  peter_lynch: "Lynch",
};

const VERDICT_STYLES = {
  undervalued: { bg: "bg-green-50", text: "text-green-700", badge: "default" as const },
  fairly_valued: { bg: "bg-gray-50", text: "text-gray-700", badge: "secondary" as const },
  overvalued: { bg: "bg-red-50", text: "text-red-700", badge: "destructive" as const },
};

interface Props {
  summary: ValuationSummary;
}

export function SummaryCard({ summary }: Props) {
  const style = VERDICT_STYLES[summary.verdict];

  // Bar chart data
  const chartData = summary.models
    .filter((m) => m.fair_value > 0)
    .map((m) => ({
      name: MODEL_SHORT_NAMES[m.model_type] ?? m.model_type,
      "Fair Value": Number(m.fair_value.toFixed(2)),
    }));

  return (
    <Card className={`p-6 ${style.bg}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm text-muted-foreground mb-1">Intrinsic Value Estimate</h2>
          <div className="text-4xl font-bold">
            ${summary.primary_fair_value.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Current price: ${summary.current_price.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <Badge variant={style.badge} className="text-base px-3 py-1">
            {summary.primary_upside > 0 ? "+" : ""}
            {summary.primary_upside.toFixed(1)}%
          </Badge>
          <div className="text-xs text-muted-foreground mt-2">
            Based on DCF Growth Exit (5Y)
          </div>
        </div>
      </div>

      <p className={`text-sm ${style.text} mb-6`}>{summary.verdict_text}</p>

      {/* All models bar chart */}
      {chartData.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">All Models vs Current Price</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Fair Value"]}
                contentStyle={{ fontSize: "13px", borderRadius: "8px" }}
              />
              <ReferenceLine
                x={summary.current_price}
                stroke="hsl(0, 0%, 40%)"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `$${summary.current_price.toFixed(0)}`,
                  position: "top",
                  style: { fontSize: 11 },
                }}
              />
              <Bar
                dataKey="Fair Value"
                fill="hsl(220, 70%, 55%)"
                radius={[0, 4, 4, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
