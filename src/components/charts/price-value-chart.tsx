"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartDataPoint {
  date: string;
  close_price: number;
  intrinsic_value: number;
}

interface Props {
  data: ChartDataPoint[];
}

export function PriceValueChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground">
        No historical data available yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: d.date,
    displayDate: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    price: d.close_price,
    intrinsic: d.intrinsic_value,
  }));

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-0.5 bg-red-400 inline-block" />
          <span className="text-sm text-muted-foreground">Price</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-0 border-t-2 border-dashed border-slate-400 inline-block" />
          <span className="text-sm text-muted-foreground">Intrinsic Value</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
        >
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
            tickLine={false}
            axisLine={{ stroke: "oklch(1 0 0 / 12%)" }}
            interval="equidistantPreserveStart"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}`}
            width={45}
            orientation="right"
          />
          <Tooltip
            contentStyle={{
              background: "oklch(0.22 0.015 260)",
              border: "1px solid oklch(1 0 0 / 12%)",
              borderRadius: "4px",
              fontSize: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              color: "oklch(0.95 0.005 260)",
            }}
            formatter={(value, name) => [
              `$${Number(value).toFixed(2)}`,
              name === "price" ? "Price" : "Intrinsic Value",
            ]}
            labelFormatter={(label) => label}
          />
          {/* Intrinsic value dashed line */}
          <Line
            type="monotone"
            dataKey="intrinsic"
            stroke="hsl(210, 15%, 50%)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
          />
          {/* Stock price solid line */}
          <Line
            type="monotone"
            dataKey="price"
            stroke="hsl(0, 70%, 60%)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: "hsl(0, 70%, 60%)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
