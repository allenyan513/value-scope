import Link from "next/link";
import type { PeerComparison } from "@/types";
import type { CompanyRow, MultipleKey } from "./data";
import { formatLargeNumber } from "@/lib/format";

interface Props {
  companyRow: CompanyRow;
  peers: PeerComparison[];
  multipleKey: MultipleKey;
}

function fmt(n: number): string {
  return formatLargeNumber(n, { prefix: "", decimals: 1, includeK: true });
}

function fmtMultiple(v: number | null): string {
  return v !== null ? `${v.toFixed(1)}x` : "—";
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function PeerComparisonTable({ companyRow, peers, multipleKey }: Props) {
  const isPE = multipleKey === "pe";
  const multipleLabel = isPE ? "P/E" : "EV/EBITDA";

  const trailingExtractor = isPE
    ? (p: PeerComparison) => p.trailing_pe
    : (p: PeerComparison) => p.ev_ebitda;
  const forwardExtractor = isPE
    ? (p: PeerComparison) => p.forward_pe
    : (p: PeerComparison) => p.forward_ev_ebitda;

  const trailingValues = peers.map(trailingExtractor).filter((v): v is number => v !== null && v > 0);
  const forwardValues = peers.map(forwardExtractor).filter((v): v is number => v !== null && v > 0);
  const trailingMedian = median(trailingValues);
  const forwardMedian = median(forwardValues);

  const companyTrailing = isPE ? companyRow.trailing_pe : companyRow.ev_ebitda;
  const companyForward = isPE ? companyRow.forward_pe : companyRow.forward_ev_ebitda;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 font-medium sticky left-0 bg-card z-10">Company</th>
            <th className="text-right py-2 font-medium px-3">Mkt Cap</th>
            <th className="text-right py-2 font-medium px-3">Trailing {multipleLabel}</th>
            <th className="text-right py-2 font-medium px-3">Forward {multipleLabel}</th>
          </tr>
        </thead>
        <tbody>
          {/* Company row (highlighted) */}
          <tr className="border-b bg-primary/5 font-semibold">
            <td className="py-2 text-primary sticky left-0 bg-primary/5 z-10">
              {companyRow.name}
              <span className="text-[10px] text-primary/60 ml-1">{companyRow.ticker}</span>
            </td>
            <td className="py-2 text-right px-3">{fmt(companyRow.market_cap)}</td>
            <td className="py-2 text-right px-3">{fmtMultiple(companyTrailing)}</td>
            <td className="py-2 text-right px-3">{fmtMultiple(companyForward)}</td>
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
              <td className="py-2 text-right px-3">{fmt(peer.market_cap)}</td>
              <td className="py-2 text-right px-3">{fmtMultiple(trailingExtractor(peer))}</td>
              <td className="py-2 text-right px-3">{fmtMultiple(forwardExtractor(peer))}</td>
            </tr>
          ))}

          {/* Median row */}
          <tr className="border-t-2 font-semibold">
            <td className="py-2 sticky left-0 bg-card z-10">Industry Median</td>
            <td className="py-2 text-right px-3"></td>
            <td className="py-2 text-right px-3">{fmtMultiple(trailingMedian)}</td>
            <td className="py-2 text-right px-3">{fmtMultiple(forwardMedian)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
