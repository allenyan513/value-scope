import Link from "next/link";
import type { PeerComparison } from "@/types";
import type { CompanyRow, MultipleKey, MultipleDetail } from "./data";
import { formatMillions } from "@/lib/format";

interface Props {
  companyRow: CompanyRow;
  peers: PeerComparison[];
  multipleKey: MultipleKey;
  detail: MultipleDetail;
  industry: string;
}

function fmtMultiple(v: number | null): string {
  return v !== null ? `${v.toFixed(1)}x` : "—";
}

function fmtVal(n: number): string {
  return formatMillions(n);
}

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Combined peer comparison + valuation bridge table.
 * Subject company → peers → industry median → bridge → fair price
 */
export function PeerValuationTable({ companyRow, peers, multipleKey, detail, industry }: Props) {
  const isPE = multipleKey === "pe";
  const multipleLabel = isPE ? "P/E" : "EV/EBITDA";

  const trailingExtractor = isPE
    ? (p: PeerComparison) => p.trailing_pe
    : (p: PeerComparison) => p.ev_ebitda;
  const forwardExtractor = isPE
    ? (p: PeerComparison) => p.forward_pe
    : (p: PeerComparison) => p.forward_ev_ebitda;

  const filteredPeers = peers.filter((p) => {
    const t = trailingExtractor(p);
    return t !== null && t > 0;
  });

  const trailingValues = filteredPeers.map(trailingExtractor).filter((v): v is number => v !== null && v > 0);
  const forwardValues = filteredPeers.map(forwardExtractor).filter((v): v is number => v !== null && v > 0);
  const trailingMedian = median(trailingValues);
  const forwardMedian = median(forwardValues);

  const companyTrailing = isPE ? companyRow.trailing_pe : companyRow.ev_ebitda;
  const companyForward = isPE ? companyRow.forward_pe : companyRow.forward_ev_ebitda;

  const { trailing, forward, isEVBased, netDebt, sharesOutstanding } = detail;

  // Shared cell style
  const cellR = "py-2.5 text-right px-4 font-mono text-sm";

  return (
    <div className="val-card">
      <h3 className="val-card-title">
        {multipleLabel} Valuation — {industry}
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        USD in millions except Fair Price. Subject company highlighted.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase tracking-wider">
              <th className="text-left py-2 font-medium sticky left-0 bg-card z-10"></th>
              <th className="text-right py-2 font-medium px-4">Mkt Cap ($M)</th>
              <th className="text-right py-2 font-medium px-4">Trailing {multipleLabel}</th>
              <th className="text-right py-2 font-medium px-4">Forward {multipleLabel}</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {/* ── Subject company ── */}
            <tr className="bg-primary/5 font-semibold border-b border-border/40">
              <td className="py-2.5 text-primary sticky left-0 bg-primary/5 z-10">
                {companyRow.name}
                <span className="text-[10px] text-primary/50 ml-1.5">{companyRow.ticker}</span>
              </td>
              <td className={cellR}>{formatMillions(companyRow.market_cap)}</td>
              <td className={cellR}>{fmtMultiple(companyTrailing)}</td>
              <td className={cellR}>{fmtMultiple(companyForward)}</td>
            </tr>

            {/* ── Peer rows ── */}
            {filteredPeers.map((peer) => (
              <tr key={peer.ticker} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="py-2.5 sticky left-0 bg-card z-10">
                  <Link
                    href={`/${peer.ticker}/valuation/trading-multiples`}
                    className="text-foreground/80 hover:text-primary hover:underline"
                    prefetch={false}
                  >
                    {peer.name}
                  </Link>
                  <span className="text-[10px] text-muted-foreground/60 ml-1.5">{peer.ticker}</span>
                </td>
                <td className={cellR}>{formatMillions(peer.market_cap)}</td>
                <td className={cellR}>{fmtMultiple(trailingExtractor(peer))}</td>
                <td className={cellR}>{fmtMultiple(forwardExtractor(peer))}</td>
              </tr>
            ))}

            {/* ── Industry Median ── */}
            <tr className="border-t-2 border-border font-semibold">
              <td className="py-2.5 sticky left-0 bg-card z-10" colSpan={2}>Industry Median</td>
              <td className={cellR}>{fmtMultiple(trailingMedian)}</td>
              <td className={cellR}>{fmtMultiple(forwardMedian)}</td>
            </tr>

            {/* ── Valuation Bridge ── */}
            {(trailing || forward) && (
              <>
                <BridgeRow
                  label={isPE ? "(*) Profit after tax" : "(*) EBITDA"}
                  trailing={trailing ? fmtVal(trailing.companyMetric) : undefined}
                  forward={forward ? fmtVal(forward.companyMetric) : undefined}
                />

                {isEVBased && (
                  <>
                    <BridgeRow
                      label="= Enterprise Value"
                      trailing={trailing?.enterpriseValue ? fmtVal(trailing.enterpriseValue) : undefined}
                      forward={forward?.enterpriseValue ? fmtVal(forward.enterpriseValue) : undefined}
                      accent
                    />
                    <BridgeRow
                      label="(-) Net Debt"
                      trailing={trailing ? fmtVal(netDebt) : undefined}
                      forward={forward ? fmtVal(netDebt) : undefined}
                    />
                  </>
                )}

                <BridgeRow
                  label="Equity Value"
                  trailing={trailing
                    ? fmtVal(isEVBased ? (trailing.equityValue ?? 0) : trailing.industryMedian * trailing.companyMetric)
                    : undefined}
                  forward={forward
                    ? fmtVal(isEVBased ? (forward.equityValue ?? 0) : forward.industryMedian * forward.companyMetric)
                    : undefined}
                  accent
                />

                <BridgeRow
                  label="(/) Outstanding shares"
                  trailing={trailing ? fmtVal(sharesOutstanding) : undefined}
                  forward={forward ? fmtVal(sharesOutstanding) : undefined}
                />

                <BridgeRow
                  label="Fair Price"
                  trailing={trailing ? `$${trailing.fairPrice.toFixed(0)}` : undefined}
                  forward={forward ? `$${forward.fairPrice.toFixed(0)}` : undefined}
                  primary
                />
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Selected value callout */}
      {detail.fairValue !== null && trailing && forward && (
        <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">
              Selected Fair Value (avg of trailing + forward)
            </div>
            <div className="text-xl font-bold font-mono text-primary mt-0.5">
              ${detail.fairValue.toFixed(2)}
            </div>
          </div>
          {detail.upside !== null && (
            <div className={`text-xl font-bold font-mono ${detail.upside >= 0 ? "text-green-400" : "text-red-400"}`}>
              {detail.upside >= 0 ? "+" : ""}{detail.upside.toFixed(1)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BridgeRow({
  label,
  trailing,
  forward,
  accent,
  primary,
}: {
  label: string;
  trailing?: string;
  forward?: string;
  accent?: boolean;
  primary?: boolean;
}) {
  const cellBase = "py-2.5 text-right px-4 font-mono text-sm";

  if (primary) {
    return (
      <tr className="border-t-2 border-primary/30">
        <td className="py-3 text-sm font-bold text-primary sticky left-0 bg-card z-10" colSpan={2}>
          {label}
        </td>
        {trailing !== undefined && (
          <td className={`py-3 text-right px-4 font-mono text-base font-bold text-primary`}>{trailing}</td>
        )}
        {forward !== undefined && (
          <td className={`py-3 text-right px-4 font-mono text-base font-bold text-primary`}>{forward}</td>
        )}
      </tr>
    );
  }

  return (
    <tr className={accent ? "border-t border-border/30 font-semibold" : ""}>
      <td
        className={`py-2.5 text-sm sticky left-0 bg-card z-10 ${accent ? "text-foreground" : "text-muted-foreground"}`}
        colSpan={2}
      >
        {label}
      </td>
      {trailing !== undefined && (
        <td className={`${cellBase} ${accent ? "text-foreground" : "text-muted-foreground"}`}>{trailing}</td>
      )}
      {forward !== undefined && (
        <td className={`${cellBase} ${accent ? "text-foreground" : "text-muted-foreground"}`}>{forward}</td>
      )}
    </tr>
  );
}
