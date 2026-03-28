import type { MultipleDetail } from "./data";
import type { MultipleLeg } from "@/lib/valuation/trading-multiples";
import { formatLargeNumber } from "@/lib/format";

interface Props {
  detail: MultipleDetail;
}

function fmt(n: number): string {
  return formatLargeNumber(n, { prefix: "", decimals: 1, includeK: true });
}

/** Bridge calculation for a single multiple (trailing + forward columns) */
export function MultipleBridgeCard({ detail }: Props) {
  const { trailing, forward, isEVBased, netDebt, sharesOutstanding } = detail;

  if (!trailing && !forward) return null;

  return (
    <div className="val-card">
      <h3 className="val-card-title">{detail.label} Valuation Bridge</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 font-medium"></th>
              {trailing && <th className="text-right py-2 font-medium px-3">Trailing</th>}
              {forward && <th className="text-right py-2 font-medium px-3">Forward</th>}
            </tr>
          </thead>
          <tbody>
            {/* Row 1: Industry Median Multiple */}
            <BridgeRow
              label={`Industry Median ${detail.label}`}
              trailing={trailing ? `${trailing.industryMedian.toFixed(1)}x` : undefined}
              forward={forward ? `${forward.industryMedian.toFixed(1)}x` : undefined}
            />

            {/* Row 2: × Company Metric */}
            <BridgeRow
              label={trailing ? `× ${trailing.metricLabel}` : `× ${forward!.metricLabel}`}
              trailing={trailing ? `$${fmt(trailing.companyMetric)}` : undefined}
              forward={forward ? `$${fmt(forward.companyMetric)}` : undefined}
              isOperator
            />

            {isEVBased ? (
              <>
                {/* EV bridge */}
                <BridgeRow
                  label="= Enterprise Value"
                  trailing={trailing?.enterpriseValue ? `$${fmt(trailing.enterpriseValue)}` : undefined}
                  forward={forward?.enterpriseValue ? `$${fmt(forward.enterpriseValue)}` : undefined}
                  isSeparator
                />
                <BridgeRow
                  label="− Net Debt"
                  trailing={trailing ? `$${fmt(netDebt)}` : undefined}
                  forward={forward ? `$${fmt(netDebt)}` : undefined}
                  isOperator
                />
                <BridgeRow
                  label="= Equity Value"
                  trailing={trailing?.equityValue ? `$${fmt(trailing.equityValue)}` : undefined}
                  forward={forward?.equityValue ? `$${fmt(forward.equityValue)}` : undefined}
                  isSeparator
                />
                <BridgeRow
                  label="÷ Shares Outstanding"
                  trailing={trailing ? fmt(sharesOutstanding) : undefined}
                  forward={forward ? fmt(sharesOutstanding) : undefined}
                  isOperator
                />
              </>
            ) : (
              <>
                {/* Equity bridge (P/E): median × net income = equity, ÷ shares */}
                <BridgeRow
                  label="= Equity Value"
                  trailing={trailing ? `$${fmt(trailing.industryMedian * trailing.companyMetric)}` : undefined}
                  forward={forward ? `$${fmt(forward.industryMedian * forward.companyMetric)}` : undefined}
                  isSeparator
                />
                <BridgeRow
                  label="÷ Shares Outstanding"
                  trailing={trailing ? fmt(sharesOutstanding) : undefined}
                  forward={forward ? fmt(sharesOutstanding) : undefined}
                  isOperator
                />
              </>
            )}

            {/* Final row: Fair Price per share */}
            <BridgeRow
              label="= Fair Price"
              trailing={trailing ? `$${trailing.fairPrice.toFixed(2)}` : undefined}
              forward={forward ? `$${forward.fairPrice.toFixed(2)}` : undefined}
              isPrimary
              isSeparator
            />
          </tbody>
        </table>
      </div>

      {/* Selected value callout */}
      {detail.fairValue !== null && (
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">
              Selected Fair Value
              {trailing && forward && (
                <span className="ml-1">(avg of trailing + forward)</span>
              )}
            </div>
            <div className="text-lg font-bold font-mono text-primary">
              ${detail.fairValue.toFixed(2)}
            </div>
          </div>
          {detail.upside !== null && (
            <div className={`text-lg font-bold font-mono ${detail.upside >= 0 ? "text-green-400" : "text-red-400"}`}>
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
  isOperator,
  isSeparator,
  isPrimary,
}: {
  label: string;
  trailing?: string;
  forward?: string;
  isOperator?: boolean;
  isSeparator?: boolean;
  isPrimary?: boolean;
}) {
  return (
    <tr className={`${isSeparator ? "border-t border-border/40" : ""} ${isPrimary ? "font-semibold text-primary" : ""}`}>
      <td className={`py-1.5 ${isOperator ? "text-muted-foreground" : ""} text-xs`}>
        {label}
      </td>
      {trailing !== undefined && (
        <td className={`py-1.5 text-right px-3 font-mono text-xs ${isPrimary ? "" : ""}`}>
          {trailing}
        </td>
      )}
      {forward !== undefined && (
        <td className={`py-1.5 text-right px-3 font-mono text-xs ${isPrimary ? "" : ""}`}>
          {forward}
        </td>
      )}
    </tr>
  );
}
