// ============================================================
// Historical Multiples Computation
// Shared logic for computing P/E, P/S, P/B from price + financials
// Used by both the API route and the SSR data layer
// ============================================================

import type {
  HistoricalMultiplesPoint,
  MultipleStats,
  HistoricalRelativeValuation,
  FinancialStatement,
} from "@/types";

interface DailyPrice {
  date: string;
  close: number;
}

// --- Core: compute historical multiples from prices + financials ---

export function computeHistoricalMultiples(
  financials: FinancialStatement[],
  prices: DailyPrice[]
): HistoricalMultiplesPoint[] {
  if (financials.length === 0 || prices.length === 0) return [];

  const sortedFinancials = [...financials].sort(
    (a, b) => a.fiscal_year - b.fiscal_year
  );

  const result: HistoricalMultiplesPoint[] = [];

  for (const price of prices) {
    const priceDate = new Date(price.date);
    const priceYear = priceDate.getFullYear();
    const priceMonth = priceDate.getMonth();

    const fin = findApplicableFinancial(sortedFinancials, priceYear, priceMonth);
    if (!fin) continue;

    const shares = fin.shares_outstanding;
    if (!shares || shares <= 0) continue;

    const marketCap = price.close * shares;
    const eps = fin.eps_diluted || fin.eps;
    const pe = eps > 0 ? price.close / eps : null;
    const ps = fin.revenue > 0 ? marketCap / fin.revenue : null;
    const pb = fin.total_equity > 0 ? marketCap / fin.total_equity : null;

    // EV/EBITDA: EV = Market Cap + Total Debt - Cash
    const totalDebt = fin.total_debt || 0;
    const cash = fin.cash_and_equivalents || 0;
    const ev = marketCap + totalDebt - cash;
    const ebitda = fin.ebitda || 0;
    const evEbitda = ebitda > 0 && ev > 0 ? ev / ebitda : null;

    result.push({
      date: price.date,
      pe: pe !== null ? Math.round(pe * 100) / 100 : null,
      ps: ps !== null ? Math.round(ps * 100) / 100 : null,
      pb: pb !== null ? Math.round(pb * 100) / 100 : null,
      ev_ebitda: evEbitda !== null ? Math.round(evEbitda * 100) / 100 : null,
    });
  }

  return result;
}

// --- Statistics: compute avg, p25, p75, percentile for each multiple ---

const CAPS: Record<string, number> = { pe: 200, ps: 100, pb: 50, ev_ebitda: 100 };

function computeStats(
  values: number[],
  cap: number
): MultipleStats | null {
  const valid = values.filter((v) => v > 0 && v < cap);
  if (valid.length < 10) return null;

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avg = sum / valid.length;
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const current = valid[valid.length - 1]; // most recent

  // Percentile: what % of historical values are below current
  const belowCount = sorted.filter((v) => v < current).length;
  const percentile = Math.round((belowCount / sorted.length) * 100);

  return {
    current: Math.round(current * 100) / 100,
    avg5y: Math.round(avg * 100) / 100,
    p25: Math.round(p25 * 100) / 100,
    p75: Math.round(p75 * 100) / 100,
    percentile,
    dataPoints: valid.length,
  };
}

export function computeMultiplesStats(data: HistoricalMultiplesPoint[]) {
  return {
    pe: computeStats(
      data.map((d) => d.pe).filter((v): v is number => v !== null),
      CAPS.pe
    ),
    ps: computeStats(
      data.map((d) => d.ps).filter((v): v is number => v !== null),
      CAPS.ps
    ),
    pb: computeStats(
      data.map((d) => d.pb).filter((v): v is number => v !== null),
      CAPS.pb
    ),
    ev_ebitda: computeStats(
      data.map((d) => d.ev_ebitda).filter((v): v is number => v != null),
      CAPS.ev_ebitda
    ),
  };
}

// --- Valuations: compute fair value from historical averages ---

export function computeHistoricalValuations(
  stats: ReturnType<typeof computeMultiplesStats>,
  latestFinancial: FinancialStatement,
  sharesOutstanding: number
): HistoricalRelativeValuation[] {
  const result: HistoricalRelativeValuation[] = [];

  // P/E valuation
  const eps = latestFinancial.eps_diluted || latestFinancial.eps;
  if (stats.pe && eps > 0) {
    const fairValue = stats.pe.avg5y * eps;
    result.push({
      type: "pe",
      label: "P/E Ratio",
      currentMultiple: stats.pe.current,
      historicalAvg: stats.pe.avg5y,
      percentile: stats.pe.percentile,
      fairValue: Math.round(fairValue * 100) / 100,
      lowEstimate: Math.round(stats.pe.p25 * eps * 100) / 100,
      highEstimate: Math.round(stats.pe.p75 * eps * 100) / 100,
      currentMetric: Math.round(eps * 100) / 100,
      metricLabel: "EPS",
      deviation:
        stats.pe.current !== null
          ? Math.round(((stats.pe.current - stats.pe.avg5y) / stats.pe.avg5y) * 100)
          : 0,
    });
  }

  // P/S valuation
  const revenue = latestFinancial.revenue;
  if (stats.ps && revenue > 0 && sharesOutstanding > 0) {
    const revenuePerShare = revenue / sharesOutstanding;
    const fairValue = stats.ps.avg5y * revenuePerShare;
    result.push({
      type: "ps",
      label: "P/S Ratio",
      currentMultiple: stats.ps.current,
      historicalAvg: stats.ps.avg5y,
      percentile: stats.ps.percentile,
      fairValue: Math.round(fairValue * 100) / 100,
      lowEstimate: Math.round(stats.ps.p25 * revenuePerShare * 100) / 100,
      highEstimate: Math.round(stats.ps.p75 * revenuePerShare * 100) / 100,
      currentMetric: Math.round(revenuePerShare * 100) / 100,
      metricLabel: "Revenue/Share",
      deviation:
        stats.ps.current !== null
          ? Math.round(((stats.ps.current - stats.ps.avg5y) / stats.ps.avg5y) * 100)
          : 0,
    });
  }

  // P/B valuation
  const equity = latestFinancial.total_equity;
  if (stats.pb && equity > 0 && sharesOutstanding > 0) {
    const bookPerShare = equity / sharesOutstanding;
    const fairValue = stats.pb.avg5y * bookPerShare;
    result.push({
      type: "pb",
      label: "P/B Ratio",
      currentMultiple: stats.pb.current,
      historicalAvg: stats.pb.avg5y,
      percentile: stats.pb.percentile,
      fairValue: Math.round(fairValue * 100) / 100,
      lowEstimate: Math.round(stats.pb.p25 * bookPerShare * 100) / 100,
      highEstimate: Math.round(stats.pb.p75 * bookPerShare * 100) / 100,
      currentMetric: Math.round(bookPerShare * 100) / 100,
      metricLabel: "Book Value/Share",
      deviation:
        stats.pb.current !== null
          ? Math.round(((stats.pb.current - stats.pb.avg5y) / stats.pb.avg5y) * 100)
          : 0,
    });
  }

  return result;
}

// --- Helpers ---

function findApplicableFinancial(
  financials: FinancialStatement[],
  priceYear: number,
  priceMonth: number
): FinancialStatement | null {
  const availableFY = priceMonth >= 3 ? priceYear - 1 : priceYear - 2;
  let best: FinancialStatement | null = null;
  for (const f of financials) {
    if (f.fiscal_year <= availableFY) {
      if (!best || f.fiscal_year > best.fiscal_year) {
        best = f;
      }
    }
  }
  return best;
}

export function sampleData(
  data: HistoricalMultiplesPoint[],
  maxPoints: number
): HistoricalMultiplesPoint[] {
  if (data.length <= maxPoints) return data;
  const result: HistoricalMultiplesPoint[] = [data[0]];
  const step = (data.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(data[Math.round(i * step)]);
  }
  result.push(data[data.length - 1]);
  return result;
}
