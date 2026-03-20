"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DataPoint {
  date: string;
  close_price: number;
  intrinsic_value: number;
}

interface Props {
  ticker: string;
}

const RANGES = [
  { label: "1Y", days: 365 },
  { label: "3Y", days: 365 * 3 },
  { label: "5Y", days: 365 * 5 },
];

export function PriceValueChart({ ticker }: Props) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [range, setRange] = useState(365);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history/${ticker}?days=${range}`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker, range]);

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground">
        Loading chart...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-muted-foreground">
        No historical valuation data available yet. Check back after daily update.
      </div>
    );
  }

  // Format data for display
  const chartData = data.map((d) => ({
    date: d.date,
    displayDate: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    "Stock Price": d.close_price,
    "Intrinsic Value": d.intrinsic_value,
  }));

  return (
    <div>
      <div className="flex justify-end gap-1 mb-4">
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRange(r.days)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              range === r.days
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(220, 70%, 55%)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(220, 70%, 55%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 90%)" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 11 }}
            tickLine={false}
            interval="equidistantPreserveStart"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(0, 0%, 100%)",
              border: "1px solid hsl(0, 0%, 90%)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
            formatter={(value) => [`$${Number(value).toFixed(2)}`]}
            labelFormatter={(label) => label}
          />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="line"
            wrapperStyle={{ fontSize: "13px" }}
          />
          <Area
            type="monotone"
            dataKey="Stock Price"
            stroke="hsl(220, 70%, 55%)"
            strokeWidth={2}
            fill="url(#gradPrice)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="Intrinsic Value"
            stroke="hsl(142, 70%, 45%)"
            strokeWidth={2}
            strokeDasharray="6 3"
            fill="url(#gradValue)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
