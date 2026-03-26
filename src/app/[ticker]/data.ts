import { cache } from "react";
import {
  getCompany,
  getFinancials,
  getEstimates,
  getLatestPrice,
  getIndustryPeers,
  getPriceTargets,
  getPriceHistory,
  getValuationHistory,
  enqueueDataRequest,
} from "@/lib/db/queries";
import { getTenYearTreasuryYield } from "@/lib/data/fred";
import { getKeyMetrics, getEarningsSurprises, getAnalystRecommendations, getUpgradesDowngrades, getEarningsCalendar } from "@/lib/data/fmp";
import { getHistoricalPrices } from "@/lib/data/fmp";
import { computeFullValuation } from "@/lib/valuation/summary";
import { computeHistoricalMultiples } from "@/lib/valuation/historical-multiples";
import { DEFAULT_HISTORY_DAYS, MAX_EMA_SPAN, HISTORY_SAMPLE_MAX, TICKER_REGEX } from "@/lib/constants";
import { toDateString } from "@/lib/format";
import type { PeerComparison, EarningsSurprise, AnalystRecommendation, UpgradeDowngrade } from "@/types";

/**
 * Core ticker data — needed by ALL pages.
 * Fetches company, financials, estimates, peers, and computes valuation.
 * Does NOT fetch analyst-only data (priceTargets, earningsSurprises).
 */
export const getCoreTickerData = cache(async (ticker: string) => {
  const upperTicker = ticker.toUpperCase();

  // Level 1: ALL independent queries in parallel (flattened from 2 sequential batches)
  const [company, historicals, estimates, riskFreeRate, prices, latestPrice, peerCompanies] =
    await Promise.all([
      getCompany(upperTicker),
      getFinancials(upperTicker, "annual", 5),
      getEstimates(upperTicker),
      getTenYearTreasuryYield().catch(() => 0.0425),
      getPriceHistory(upperTicker, 365 * 5),
      getLatestPrice(upperTicker),
      getIndustryPeers(upperTicker, 15),
    ]);

  if (!company || historicals.length === 0) {
    if (TICKER_REGEX.test(upperTicker)) {
      await enqueueDataRequest(upperTicker).catch(() => {});
    }
    if (!company) {
      return {
        company: null,
        summary: null,
        estimates: [],
        historicals: [],
        historicalMultiples: [],
        peers: [],
        pending: true,
      };
    }
    return {
      company,
      summary: null,
      estimates,
      historicals,
      historicalMultiples: [],
      peers: [],
    };
  }

  const currentPrice = latestPrice || company.price || 0;

  // Level 2: computation + peer metrics in parallel
  const historicalMultiples = computeHistoricalMultiples(historicals, prices);

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
          ev_ebitda: null,
          price_to_book: metrics[0].priceToBookRatio ?? null,
          price_to_sales: metrics[0].priceToSalesRatio ?? null,
          revenue_growth: null,
          net_margin: null,
          roe: null,
        } as PeerComparison;
      }
    } catch {
      // Skip unavailable peers
    }
    return null;
  });

  const peerResults = await Promise.all(peerMetricsPromises);
  const peers = peerResults.filter((p): p is PeerComparison => p !== null);

  const summary = computeFullValuation({
    company,
    historicals,
    estimates,
    peers,
    currentPrice,
    riskFreeRate,
    historicalMultiples,
  });

  return { company, summary, estimates, historicals, historicalMultiples, peers };
});

/**
 * Analyst-only data — needed only by /analyst-estimates page.
 * Fetches price targets, earnings surprises, price history, recommendations,
 * upgrades/downgrades, and next earnings date — all in parallel.
 */
export const getAnalystData = cache(async (ticker: string) => {
  const upperTicker = ticker.toUpperCase();

  const [
    priceTargets,
    rawSurprises,
    priceHistory,
    rawRecommendations,
    rawUpgrades,
    rawEarningsCalendar,
  ] = await Promise.all([
    getPriceTargets(upperTicker).catch(() => null),
    getEarningsSurprises(upperTicker, 12).catch(() => []),
    getPriceHistory(upperTicker, 365 * 2).catch(() => []),
    getAnalystRecommendations(upperTicker).catch(() => null),
    getUpgradesDowngrades(upperTicker, 10).catch(() => []),
    getEarningsCalendar(upperTicker).catch(() => null),
  ]);

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

  const recommendations: AnalystRecommendation | null = rawRecommendations
    ? {
        strongBuy: rawRecommendations.strongBuy,
        buy: rawRecommendations.buy,
        hold: rawRecommendations.hold,
        sell: rawRecommendations.sell,
        strongSell: rawRecommendations.strongSell,
        totalAnalysts:
          rawRecommendations.strongBuy +
          rawRecommendations.buy +
          rawRecommendations.hold +
          rawRecommendations.sell +
          rawRecommendations.strongSell,
        consensus: rawRecommendations.consensus,
      }
    : null;

  const upgradesDowngrades: UpgradeDowngrade[] = rawUpgrades.map((u) => ({
    date: u.publishedDate,
    gradingCompany: u.gradingCompany,
    previousGrade: u.previousGrade,
    newGrade: u.newGrade,
    action: u.action,
  }));

  const nextEarningsDate: string | null = rawEarningsCalendar?.date ?? null;

  return {
    priceTargets,
    earningsSurprises,
    priceHistory,
    recommendations,
    upgradesDowngrades,
    nextEarningsDate,
  };
});

/**
 * Chart history data — needed only by the summary page chart.
 * Extracted from /api/history/[ticker] to avoid client-side waterfall.
 */
export const getChartHistory = cache(async (ticker: string) => {
  const upperTicker = ticker.toUpperCase();
  const days = DEFAULT_HISTORY_DAYS;

  // Fetch both valuation history and price history in parallel
  const [history, dbPrices] = await Promise.all([
    getValuationHistory(upperTicker, days),
    getPriceHistory(upperTicker, days),
  ]);

  // If we have enough valuation history (>30 days), use it directly
  if (history.length >= 30) {
    return history;
  }

  // Otherwise, build from daily_prices as the price backbone
  let closePrices: { date: string; close: number }[] = [];
  if (dbPrices.length > 0) {
    closePrices = dbPrices.map((p) => ({ date: p.date, close: p.close }));
  }

  // Fallback 2: FMP API
  if (closePrices.length === 0) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const from = toDateString(fromDate);
    const to = toDateString(new Date());

    try {
      const fmpPrices = await getHistoricalPrices(upperTicker, from, to);
      closePrices = fmpPrices
        .map((p) => ({ date: p.date, close: p.close }))
        .reverse();
    } catch {
      // FMP unavailable
    }
  }

  if (closePrices.length === 0) {
    return [];
  }

  // Generate synthetic intrinsic value as a smoothed trend line (EMA)
  const priceValues = closePrices.map((p) => p.close);
  const emaSpan = Math.min(MAX_EMA_SPAN, Math.floor(priceValues.length / 3));
  const alpha = 2 / (emaSpan + 1);

  let ema = priceValues[0];
  const emaValues: number[] = [];
  for (const price of priceValues) {
    ema = alpha * price + (1 - alpha) * ema;
    emaValues.push(ema);
  }

  const lastEma = emaValues[emaValues.length - 1];
  const lastPrice = priceValues[priceValues.length - 1];
  const discountFactor =
    lastPrice > 0 ? Math.min(lastEma / lastPrice, 0.95) : 0.7;

  // Merge real intrinsic values from valuation_history where available
  const realIVMap = new Map(
    history.map((h) => [h.date, h.intrinsic_value])
  );

  const syntheticHistory = closePrices.map((p, i) => ({
    date: p.date,
    close_price: p.close,
    intrinsic_value: realIVMap.get(p.date) ?? Math.round(emaValues[i] * discountFactor * 100) / 100,
  }));

  // Sample to ~500 points max
  if (syntheticHistory.length > HISTORY_SAMPLE_MAX) {
    const step = Math.ceil(syntheticHistory.length / HISTORY_SAMPLE_MAX);
    const sampled = syntheticHistory.filter((_, i) => i % step === 0);
    if (sampled[sampled.length - 1] !== syntheticHistory[syntheticHistory.length - 1]) {
      sampled.push(syntheticHistory[syntheticHistory.length - 1]);
    }
    return sampled;
  }

  return syntheticHistory;
});

// ---- Legacy compat: re-export the old shape for any callers not yet migrated ----

/** @deprecated Use getCoreTickerData + getAnalystData instead */
export const getTickerData = cache(async (ticker: string) => {
  const core = await getCoreTickerData(ticker);
  if (!core.summary) {
    return {
      ...core,
      priceTargets: null,
      earningsSurprises: [] as EarningsSurprise[],
      priceHistory: [],
    };
  }
  const analyst = await getAnalystData(ticker);
  return { ...core, ...analyst };
});
