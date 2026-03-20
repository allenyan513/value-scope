import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompany, getFinancials, getEstimates, getLatestPrice, getIndustryPeers } from "@/lib/db/queries";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import { getKeyMetrics } from "@/lib/data/fmp";
import { computeFullValuation } from "@/lib/valuation/summary";
import type { PeerComparison } from "@/types";
import { StockValuationClient } from "./client";

interface Props {
  params: Promise<{ ticker: string }>;
}

// ISR: revalidate every hour
export const revalidate = 3600;

// Pre-render top stocks at build time
export async function generateStaticParams() {
  // Will be populated once data is seeded
  // For now, return empty — pages will be generated on demand
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  if (!company) {
    return { title: `${upperTicker} — Stock Valuation` };
  }

  return {
    title: `${upperTicker} Intrinsic Value & Fair Price — ${company.name}`,
    description: `Is ${company.name} (${upperTicker}) undervalued? See DCF, P/E, EV/EBITDA, and Peter Lynch valuations with transparent assumptions. Updated daily.`,
    openGraph: {
      title: `${upperTicker} — Fair Value Analysis | ValuScope`,
      description: `${company.name} stock valuation using 7 models. Current price: $${company.price?.toFixed(2)}`,
    },
  };
}

export default async function StockValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Fetch all data in parallel
  const [company, historicals, estimates, riskFreeRate] = await Promise.all([
    getCompany(upperTicker),
    getFinancials(upperTicker, "annual", 7),
    getEstimates(upperTicker),
    getTenYearTreasuryYield().catch(() => 0.0425),
  ]);

  if (!company) {
    notFound();
  }

  if (historicals.length === 0) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">{company.name} ({upperTicker})</h1>
        <p className="text-muted-foreground">
          Financial data not yet available for this company. We are currently seeding data — please check back soon.
        </p>
      </div>
    );
  }

  const currentPrice = (await getLatestPrice(upperTicker)) || company.price || 0;

  // Get peer data for trading multiples
  const peerCompanies = await getIndustryPeers(upperTicker, 15);
  const peers: PeerComparison[] = [];

  // Fetch peer metrics (batch to reduce latency)
  const peerMetricsPromises = peerCompanies.slice(0, 10).map(async (peer) => {
    try {
      const metrics = await getKeyMetrics(peer.ticker, "annual", 1);
      if (metrics.length > 0) {
        return {
          ticker: peer.ticker,
          name: peer.name,
          market_cap: peer.market_cap,
          trailing_pe: metrics[0].peRatio,
          forward_pe: null,
          ev_ebitda: metrics[0].enterpriseValueOverEBITDA,
        } as PeerComparison;
      }
    } catch {
      // Skip
    }
    return null;
  });

  const peerResults = await Promise.all(peerMetricsPromises);
  peers.push(...peerResults.filter((p): p is PeerComparison => p !== null));

  // Compute valuation
  const summary = computeFullValuation({
    company,
    historicals,
    estimates,
    peers,
    currentPrice,
    riskFreeRate,
  });

  return (
    <StockValuationClient
      summary={summary}
      company={company}
      ticker={upperTicker}
    />
  );
}
