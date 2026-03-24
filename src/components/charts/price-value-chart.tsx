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

  const lastPoint = data[data.length - 1];
  const currentPrice = lastPoint.close_price;
  const intrinsicValue = lastPoint.intrinsic_value;
  const upside =
    intrinsicValue > 0
      ? ((intrinsicValue - currentPrice) / currentPrice) * 100
      : 0;
  const isOvervalued = upside < -5;
  const isUndervalued = upside > 5;

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
      {/* Right-side labels */}
      <div className="flex flex-wrap items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-0.5 bg-red-400 inline-block" />
          <span className="text-sm text-muted-foreground">Price</span>
          <span className="text-sm font-mono font-semibold">
            {currentPrice.toFixed(2)}
          </span>
        </div>
        <div
          className={`text-sm font-semibold px-2 py-0.5 rounded ${
            isOvervalued
              ? "bg-red-50 text-red-600"
              : isUndervalued
                ? "bg-green-50 text-green-600"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {Math.abs(upside).toFixed(0)}%{" "}
          {isOvervalued ? "OVERVALUED" : isUndervalued ? "UNDERVALUED" : "FAIR"}
        </div>
        <div className="flex items-center gap-2">
          <span className="w-6 h-0 border-t-2 border-dashed border-slate-400 inline-block" />
          <span className="text-sm text-muted-foreground">Intrinsic Value</span>
          <span className="text-sm font-mono font-semibold">
            {intrinsicValue.toFixed(2)}
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
        >
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11, fill: "hsl(0, 0%, 55%)" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(0, 0%, 88%)" }}
            interval="equidistantPreserveStart"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(0, 0%, 55%)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}`}
            width={45}
            orientation="right"
          />
          <Tooltip
            contentStyle={{
              background: "white",
              border: "1px solid hsl(0, 0%, 88%)",
              borderRadius: "6px",
              fontSize: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
