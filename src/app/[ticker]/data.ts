import { cache } from "react";
import { notFound } from "next/navigation";
import {
  getCompany,
  getFinancials,
  getEstimates,
  getLatestPrice,
  getIndustryPeers,
  getPriceTargets,
  getPriceHistory,
} from "@/lib/db/queries";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import { getKeyMetrics, getEarningsSurprises } from "@/lib/data/fmp";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import type { PeerComparison, EarningsSurprise } from "@/types";

export const getTickerData = cache(async (ticker: string) => {
  const upperTicker = ticker.toUpperCase();

  const [company, historicals, estimates, riskFreeRate, prices] =
    await Promise.all([
      getCompany(upperTicker),
      getFinancials(upperTicker, "annual", 7),
      getEstimates(upperTicker),
      getTenYearTreasuryYield().catch(() => 0.0425),
      getPriceHistory(upperTicker, 365 * 5),
    ]);

  if (!company) {
    notFound();
  }

  if (historicals.length === 0) {
    return {
      company,
      summary: null,
      estimates,
      historicals,
      historicalMultiples: [],
      priceTargets: null,
      earningsSurprises: [] as EarningsSurprise[],
      priceHistory: [],
    };
  }

  const currentPrice =
    (await getLatestPrice(upperTicker)) || company.price || 0;

  // Compute historical multiples for self-comparison valuation
  const historicalMultiples = computeHistoricalMultiples(historicals, prices);

  // Get peer data (supplementary — used as fallback and sector reference)
  const peerCompanies = await getIndustryPeers(upperTicker, 15);
  const peers: PeerComparison[] = [];

  const peerMetricsPromises = peerCompanies.slice(0, 10).map(async (peer) => {
    try {
      const metrics = await getKeyMetrics(peer.ticker, "annual", 1);
      if (metrics.length > 0) {
        return {
          ticker: peer.ticker,
          name: peer.name,
          market_cap: peer.market_cap,
          trailing_pe: metrics[0].priceToEarningsRatio ?? null,
          forward_pe: null,
          ps_ratio: metrics[0].priceToSalesRatio ?? null,
          pb_ratio: metrics[0].priceToBookRatio ?? null,
        } as PeerComparison;
      }
    } catch {
      // Skip
    }
    return null;
  });

  const peerResults = await Promise.all(peerMetricsPromises);
  peers.push(...peerResults.filter((p): p is PeerComparison => p !== null));

  const summary = computeFullValuation({
    company,
    historicals,
    estimates,
    peers,
    currentPrice,
    riskFreeRate,
    historicalMultiples,
  });

  // Fetch price targets, earnings surprises, and 2-year price history in parallel
  const [priceTargets, rawSurprises, priceHistory] = await Promise.all([
    getPriceTargets(upperTicker).catch(() => null),
    getEarningsSurprises(upperTicker, 12).catch(() => []),
    getPriceHistory(upperTicker, 365 * 2).catch(() => []),
  ]);

  // Normalize earnings surprises
  const earningsSurprises: EarningsSurprise[] = rawSurprises.map((s) => ({
    date: s.date,
    actual_eps: s.actualEarningResult,
    estimated_eps: s.estimatedEarning,
    surprise_percent:
      s.estimatedEarning !== 0
        ? (s.actualEarningResult - s.estimatedEarning) /
          Math.abs(s.estimatedEarning)
        : 0,
  }));

  return { company, summary, estimates, historicals, historicalMultiples, priceTargets, earningsSurprises, priceHistory };
});
