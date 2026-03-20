"use client";

interface Props {
  waccValues: number[];
  secondAxisValues: number[];
  prices: number[][];
  currentPrice: number;
  xLabel: string; // "Terminal Growth Rate" or "Exit Multiple"
  isPercent?: boolean; // true for growth rate, false for multiples
}

export function SensitivityHeatmap({
  waccValues,
  secondAxisValues,
  prices,
  currentPrice,
  xLabel,
  isPercent = true,
}: Props) {
  function getCellColor(price: number): string {
    const ratio = price / currentPrice;
    if (ratio > 1.3) return "bg-green-100 text-green-900";
    if (ratio > 1.1) return "bg-green-50 text-green-800";
    if (ratio > 0.9) return "bg-gray-50 text-gray-800";
    if (ratio > 0.7) return "bg-red-50 text-red-800";
    return "bg-red-100 text-red-900";
  }

  function formatValue(v: number, percent: boolean): string {
    return percent ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(1)}x`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-2 border text-left text-muted-foreground">
              WACC \ {xLabel}
            </th>
            {secondAxisValues.map((v) => (
              <th key={v} className="p-2 border text-center font-medium">
                {formatValue(v, isPercent)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {waccValues.map((wacc, wi) => (
            <tr key={wacc}>
              <td className="p-2 border font-medium">
                {(wacc * 100).toFixed(1)}%
              </td>
              {prices[wi].map((price, gi) => (
                <td
                  key={gi}
                  className={`p-2 border text-center font-mono ${getCellColor(price)}`}
                >
                  ${price.toFixed(0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Current price: ${currentPrice.toFixed(2)}. Green = undervalued, Red = overvalued.
      </p>
    </div>
  );
}
