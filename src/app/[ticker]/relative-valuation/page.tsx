import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../data";
import { computeMultiplesStats } from "@/lib/valuation/historical-multiples";
import { RelativeValuationSection } from "./section";
import type { PeerComparison } from "@/types";
interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Relative Valuation — P/E & EV/EBITDA Multiples${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} relative valuation using P/E and EV/EBITDA peer comparison with transparent calculation breakdown.`,
  };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentileRange(arr: number[]): { low: number; high: number } {
  if (arr.length === 0) return { low: 0, high: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    low: sorted[Math.floor(sorted.length * 0.25)] ?? 0,
    high: sorted[Math.floor(sorted.length * 0.75)] ?? 0,
  };
}

export interface RelativeValuationData {
  type: "pe" | "ev_ebitda";
  label: string;
  currentPrice: number;
  // Trailing
  trailingMultiple: { selected: number; low: number; high: number } | null;
  trailingFairPrice: number | null;
  trailingUpside: number | null;
  // Forward (optional)
  forwardMultiple: { selected: number; low: number; high: number } | null;
  forwardFairPrice: number | null;
  forwardUpside: number | null;
  // Selected (best available or average)
  selectedFairPrice: number;
  selectedUpside: number;
  // Calculation details
  trailingMetric: number | null; // Profit after tax or EBITDA
  trailingMetricLabel: string;
  forwardMetric: number | null;
  forwardMetricLabel: string;
  // EV-specific
  netDebt: number | null;
  sharesOutstanding: number;
  // Peer table
  peers: PeerComparison[];
  companyMultiple: { trailing: number | null; forward: number | null };
  ticker: string;
  companyName: string;
}

export default async function RelativeValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary, historicals, historicalMultiples } = await getCoreTickerData(upperTicker);

  if (!summary || !historicalMultiples || historicalMultiples.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Historical data not yet available for relative valuation.
      </p>
    );
  }

  const stats = computeMultiplesStats(historicalMultiples);
  const sortedHistoricals = [...historicals].sort(
    (a, b) => b.fiscal_year - a.fiscal_year
  );
  const latest = sortedHistoricals[0];
  const shares = latest?.shares_outstanding;
  if (!latest || !shares) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Insufficient data for relative valuation analysis.
      </p>
    );
  }

  const currentPrice = summary.current_price;
  const peers = summary.models
    .find((m) => m.model_type === "pe_multiples" || m.model_type === "ev_ebitda_multiples")
    ?.details?.peers as PeerComparison[] | undefined ?? [];

  const netDebt = (latest.total_debt || 0) - (latest.cash_and_equivalents || 0);

  // --- P/E Multiples ---
  const eps = latest.eps_diluted || latest.eps;
  const trailingProfitAfterTax = eps > 0 ? latest.net_income : null;
  const trailingPEs = peers
    .map((p) => p.trailing_pe)
    .filter((v): v is number => v !== null && v > 0 && v < 200);
  // Use peer median if available, otherwise fall back to historical 5Y avg
  const trailingPEMedian = trailingPEs.length > 0
    ? median(trailingPEs)
    : stats.pe?.avg5y ?? null;
  const trailingPERange = trailingPEs.length > 0
    ? percentileRange(trailingPEs)
    : stats.pe ? { low: stats.pe.p25, high: stats.pe.p75 } : { low: 0, high: 0 };

  // Forward P/E from estimates
  const forwardPEs = peers
    .map((p) => p.forward_pe)
    .filter((v): v is number => v !== null && v > 0 && v < 200);
  const forwardPEMedian = forwardPEs.length > 0 ? median(forwardPEs) : null;
  const forwardPERange = percentileRange(forwardPEs);

  // Compute P/E fair prices
  let peTrailingFairPrice: number | null = null;
  let peTrailingUpside: number | null = null;
  if (trailingPEMedian && trailingProfitAfterTax && trailingProfitAfterTax > 0) {
    const equityValue = trailingPEMedian * trailingProfitAfterTax;
    peTrailingFairPrice = Math.round((equityValue / shares) * 100) / 100;
    peTrailingUpside = Math.round(((peTrailingFairPrice - currentPrice) / currentPrice) * 10000) / 100;
  }

  // For forward P/E — use analyst estimates if available
  const _estimates = summary.models.find((m) => m.model_type === "pe_multiples")?.assumptions;
  const peForwardFairPrice: number | null = null;
  const peForwardUpside: number | null = null;
  const forwardProfit: number | null = null; // TODO: integrate analyst forward earnings

  const peSelectedFairPrice = peTrailingFairPrice ?? 0;
  const peSelectedUpside = peTrailingUpside ?? 0;

  const peData: RelativeValuationData = {
    type: "pe",
    label: "P/E Multiples",
    currentPrice,
    trailingMultiple: trailingPEMedian ? { selected: Math.round(trailingPEMedian * 10) / 10, low: Math.round(trailingPERange.low * 10) / 10, high: Math.round(trailingPERange.high * 10) / 10 } : null,
    trailingFairPrice: peTrailingFairPrice,
    trailingUpside: peTrailingUpside,
    forwardMultiple: forwardPEMedian ? { selected: Math.round(forwardPEMedian * 10) / 10, low: Math.round(forwardPERange.low * 10) / 10, high: Math.round(forwardPERange.high * 10) / 10 } : null,
    forwardFairPrice: peForwardFairPrice,
    forwardUpside: peForwardUpside,
    selectedFairPrice: peSelectedFairPrice,
    selectedUpside: peSelectedUpside,
    trailingMetric: trailingProfitAfterTax,
    trailingMetricLabel: "Profit after tax",
    forwardMetric: forwardProfit,
    forwardMetricLabel: "Forward Profit",
    netDebt: null, // Not used for P/E
    sharesOutstanding: shares,
    peers,
    companyMultiple: {
      trailing: stats.pe?.current ?? null,
      forward: null,
    },
    ticker: upperTicker,
    companyName: summary.company_name,
  };

  // --- EV/EBITDA Multiples ---
  const ebitda = latest.ebitda;
  const trailingEVEBITDAs = peers
    .map((p) => p.ev_ebitda)
    .filter((v): v is number => v !== null && v > 0 && v < 100);
  const trailingEVEBITDAMedian = trailingEVEBITDAs.length > 0
    ? median(trailingEVEBITDAs)
    : stats.ev_ebitda?.avg5y ?? null;
  const trailingEVEBITDARange = trailingEVEBITDAs.length > 0
    ? percentileRange(trailingEVEBITDAs)
    : stats.ev_ebitda ? { low: stats.ev_ebitda.p25, high: stats.ev_ebitda.p75 } : { low: 0, high: 0 };

  let evTrailingFairPrice: number | null = null;
  let evTrailingUpside: number | null = null;
  if (trailingEVEBITDAMedian && ebitda && ebitda > 0) {
    const fairEV = trailingEVEBITDAMedian * ebitda;
    const equityValue = fairEV - netDebt;
    evTrailingFairPrice = Math.round((equityValue / shares) * 100) / 100;
    evTrailingUpside = Math.round(((evTrailingFairPrice - currentPrice) / currentPrice) * 10000) / 100;
  }

  const evData: RelativeValuationData = {
    type: "ev_ebitda",
    label: "EV/EBITDA Multiples",
    currentPrice,
    trailingMultiple: trailingEVEBITDAMedian ? { selected: Math.round(trailingEVEBITDAMedian * 10) / 10, low: Math.round(trailingEVEBITDARange.low * 10) / 10, high: Math.round(trailingEVEBITDARange.high * 10) / 10 } : null,
    trailingFairPrice: evTrailingFairPrice,
    trailingUpside: evTrailingUpside,
    forwardMultiple: null,
    forwardFairPrice: null,
    forwardUpside: null,
    selectedFairPrice: evTrailingFairPrice ?? 0,
    selectedUpside: evTrailingUpside ?? 0,
    trailingMetric: ebitda,
    trailingMetricLabel: "EBITDA",
    forwardMetric: null,
    forwardMetricLabel: "Forward EBITDA",
    netDebt,
    sharesOutstanding: shares,
    peers,
    companyMultiple: {
      trailing: stats.ev_ebitda?.current ?? null,
      forward: null,
    },
    ticker: upperTicker,
    companyName: summary.company_name,
  };

  return (
    <>
      <h2 className="text-xl font-bold mb-2">Relative Valuation</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Benchmarking {upperTicker} against peers using P/E and EV/EBITDA multiples
      </p>

      <div className="space-y-8">
        {peData.trailingMultiple && <RelativeValuationSection data={peData} />}
        {evData.trailingMultiple && <RelativeValuationSection data={evData} />}
      </div>
    </>
  );
}
