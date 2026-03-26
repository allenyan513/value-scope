import type { EarningsSurprise } from "@/types";
import { formatCurrency } from "@/lib/format";

interface Props {
  earningsSurprises: EarningsSurprise[];
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth();
  const q = month < 3 ? "Q1" : month < 6 ? "Q2" : month < 9 ? "Q3" : "Q4";
  return `${q} ${d.getFullYear()}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

export function QuarterlyEarningsTable({ earningsSurprises }: Props) {
  if (earningsSurprises.length === 0) return null;

  // Sort newest first, take last 8 quarters
  const sorted = [...earningsSurprises]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const beats = sorted.filter((s) => s.surprise_percent >= 0).length;
  const total = sorted.length;

  return (
    <div className="val-card">
      <div className="flex items-center justify-between">
        <h3 className="val-card-title">Quarterly Earnings History</h3>
        <div className="text-sm">
          <span className="text-emerald-400 font-semibold">Beat {beats}</span>
          <span className="text-muted-foreground"> of last {total} quarters</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-4 text-left font-medium text-muted-foreground">Quarter</th>
              <th className="py-2 px-4 text-right font-medium text-muted-foreground">Date</th>
              <th className="py-2 px-4 text-right font-medium text-muted-foreground">Est. EPS</th>
              <th className="py-2 px-4 text-right font-medium text-muted-foreground">Actual EPS</th>
              <th className="py-2 px-4 text-right font-medium text-muted-foreground">Surprise</th>
              <th className="py-2 pl-4 text-center font-medium text-muted-foreground">Result</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const isBeat = s.surprise_percent >= 0;
              return (
                <tr key={s.date} className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium">{formatQuarter(s.date)}</td>
                  <td className="py-2 px-4 text-right text-muted-foreground">{formatDate(s.date)}</td>
                  <td className="py-2 px-4 text-right font-mono">{formatCurrency(s.estimated_eps)}</td>
                  <td className="py-2 px-4 text-right font-mono font-semibold">{formatCurrency(s.actual_eps)}</td>
                  <td className={`py-2 px-4 text-right font-mono font-semibold ${isBeat ? "text-emerald-400" : "text-red-400"}`}>
                    {isBeat ? "+" : ""}{(s.surprise_percent * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 pl-4 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isBeat
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    }`}>
                      {isBeat ? "Beat" : "Miss"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
