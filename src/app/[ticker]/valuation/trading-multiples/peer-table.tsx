import Link from "next/link";
import type { PeerComparison } from "@/types";
import type { CompanyRow } from "./data";
import { formatLargeNumber } from "@/lib/format";

interface Props {
  companyRow: CompanyRow;
  peers: PeerComparison[];
}

function fmt(n: number, decimals = 1): string {
  return formatLargeNumber(n, { prefix: "", decimals, includeK: true });
}

function fmtMultiple(v: number | null): string {
  return v !== null ? `${v.toFixed(1)}x` : "—";
}

function fmtPct(v: number | null): string {
  return v !== null ? `${v.toFixed(1)}%` : "—";
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function PeerComparisonTable({ companyRow, peers }: Props) {
  // Compute medians from peers
  const peMedian = median(peers.map((p) => p.trailing_pe).filter((v): v is number => v !== null && v > 0));
  const evMedian = median(peers.map((p) => p.ev_ebitda).filter((v): v is number => v !== null && v > 0));

  return (
    <div className="val-card">
      <h3 className="val-card-title">Peer Comparison</h3>
      <p className="text-xs text-muted-foreground mb-3">(USD in millions except multiples and percentages)</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 font-medium sticky left-0 bg-card z-10">Company</th>
              <th className="text-right py-2 font-medium px-2">Mkt Cap</th>
              <th className="text-right py-2 font-medium px-2">P/E</th>
              <th className="text-right py-2 font-medium px-2">EV/EBITDA</th>
              <th className="text-right py-2 font-medium px-2">Rev Growth</th>
              <th className="text-right py-2 font-medium px-2">Net Margin</th>
              <th className="text-right py-2 font-medium px-2">ROE</th>
            </tr>
          </thead>
          <tbody>
            {/* Company row (highlighted) */}
            <tr className="border-b bg-primary/5 font-semibold">
              <td className="py-2 text-primary sticky left-0 bg-primary/5 z-10">
                {companyRow.name}
              </td>
              <td className="py-2 text-right px-2">{fmt(companyRow.market_cap)}</td>
              <td className="py-2 text-right px-2">{fmtMultiple(companyRow.pe)}</td>
              <td className="py-2 text-right px-2">{fmtMultiple(companyRow.ev_ebitda)}</td>
              <td className="py-2 text-right px-2">{fmtPct(companyRow.revenue_growth)}</td>
              <td className="py-2 text-right px-2">{fmtPct(companyRow.net_margin)}</td>
              <td className="py-2 text-right px-2">{fmtPct(companyRow.roe)}</td>
            </tr>

            {/* Peer rows */}
            {peers.map((peer) => (
              <tr key={peer.ticker} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-2 sticky left-0 bg-card z-10">
                  <Link
                    href={`/${peer.ticker}/valuation/trading-multiples`}
                    className="text-primary/80 hover:text-primary hover:underline"
                    prefetch={false}
                  >
                    {peer.name}
                  </Link>
                  <span className="text-[10px] text-muted-foreground ml-1">{peer.ticker}</span>
                </td>
                <td className="py-2 text-right px-2">{fmt(peer.market_cap)}</td>
                <td className="py-2 text-right px-2">{fmtMultiple(peer.trailing_pe)}</td>
                <td className="py-2 text-right px-2">{fmtMultiple(peer.ev_ebitda)}</td>
                <td className="py-2 text-right px-2">{fmtPct(peer.revenue_growth)}</td>
                <td className="py-2 text-right px-2">{fmtPct(peer.net_margin)}</td>
                <td className="py-2 text-right px-2">{fmtPct(peer.roe)}</td>
              </tr>
            ))}

            {/* Median row */}
            <tr className="border-t-2 font-semibold">
              <td className="py-2 sticky left-0 bg-card z-10">Industry Median</td>
              <td className="py-2 text-right px-2"></td>
              <td className="py-2 text-right px-2">{fmtMultiple(peMedian)}</td>
              <td className="py-2 text-right px-2">{fmtMultiple(evMedian)}</td>
              <td className="py-2 text-right px-2">—</td>
              <td className="py-2 text-right px-2">—</td>
              <td className="py-2 text-right px-2">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
