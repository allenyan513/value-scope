import type { MultipleSummary } from "./data";
import { formatLargeNumber } from "@/lib/format";

interface Props {
  multiples: MultipleSummary[];
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
}

function fmt(n: number): string {
  return formatLargeNumber(n, { prefix: "", decimals: 1, includeK: true });
}

export function MultipleBreakdownCards({ multiples, currentPrice, sharesOutstanding, netDebt }: Props) {
  const available = multiples.filter((m) => m.fairValue !== null && m.fairValue > 0);

  if (available.length === 0) return null;

  return (
    <div className="val-card">
      <h3 className="val-card-title">Valuation by Multiple</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {available.map((m) => (
          <BreakdownCard
            key={m.key}
            data={m}
            currentPrice={currentPrice}
            sharesOutstanding={sharesOutstanding}
            netDebt={netDebt}
          />
        ))}
      </div>
    </div>
  );
}

function BreakdownCard({
  data,
  currentPrice,
  sharesOutstanding,
  netDebt,
}: {
  data: MultipleSummary;
  currentPrice: number;
  sharesOutstanding: number;
  netDebt: number;
}) {
  const methodLabel = data.method === "historical_self_comparison"
    ? "5Y Historical Avg"
    : "Peer Median";

  const multipleValue = data.method === "historical_self_comparison"
    ? data.avg5y
    : data.peerMedian ?? data.avg5y;

  return (
    <div className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{data.label}</span>
        <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
          {methodLabel}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        <CalcRow label={`${methodLabel} ${data.label}`} value={multipleValue ? `${multipleValue.toFixed(1)}x` : "—"} />
        <CalcRow label={`× ${data.metricLabel}`} value={data.metric ? `$${fmt(data.metric)}` : "—"} />

        {data.isEVBased && (
          <>
            <div className="border-t border-border/40 my-1" />
            <CalcRow
              label="Enterprise Value"
              value={multipleValue && data.metric ? `$${fmt(multipleValue * data.metric)}` : "—"}
              highlight
            />
            <CalcRow label="− Net Debt" value={`$${fmt(netDebt)}`} />
            <CalcRow label="÷ Shares" value={fmt(sharesOutstanding)} />
          </>
        )}

        <div className="border-t border-border/40 my-1" />
        <CalcRow
          label="Fair Value"
          value={data.fairValue ? `$${data.fairValue.toFixed(2)}` : "—"}
          highlight
          primary
        />
        <CalcRow
          label="vs Current"
          value={data.upside !== null ? `${data.upside >= 0 ? "+" : ""}${data.upside.toFixed(1)}%` : "—"}
          color={data.upside !== null ? (data.upside >= 0 ? "text-green-400" : "text-red-400") : undefined}
        />
      </div>
    </div>
  );
}

function CalcRow({
  label,
  value,
  highlight,
  primary,
  color,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  primary?: boolean;
  color?: string;
}) {
  return (
    <div className={`flex justify-between py-0.5 ${highlight ? "font-semibold" : ""} ${primary ? "text-primary" : ""}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-xs font-mono ${color ?? ""}`}>{value}</span>
    </div>
  );
}
