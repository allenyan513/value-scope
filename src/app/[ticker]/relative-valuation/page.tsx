import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getTickerData } from "../data";
import { computeMultiplesStats, computeHistoricalValuations } from "@/lib/valuation/historical-multiples";
import { RelativeValuationCards } from "./cards";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Relative Valuation — P/E, P/S & P/B Multiples${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} relative valuation using historical P/E, P/S, and P/B multiples with trend analysis.`,
  };
}

export default async function RelativeValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary, historicals, historicalMultiples } = await getTickerData(upperTicker);

  if (!summary || !historicalMultiples || historicalMultiples.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Historical data not yet available for relative valuation.
      </p>
    );
  }

  // Compute stats and valuations from historical multiples
  const stats = computeMultiplesStats(historicalMultiples);
  const sortedHistoricals = [...historicals].sort(
    (a, b) => b.fiscal_year - a.fiscal_year
  );
  const latestFinancial = sortedHistoricals[0];
  const shares = latestFinancial?.shares_outstanding;

  const valuations = latestFinancial && shares
    ? computeHistoricalValuations(stats, latestFinancial, shares)
    : [];

  if (valuations.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Insufficient data for relative valuation analysis.
      </p>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold mb-2">Relative Valuation</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Fair values based on {upperTicker}&apos;s own 5-year historical multiples
      </p>

      <RelativeValuationCards
        valuations={valuations}
        history={historicalMultiples}
        currentPrice={summary.current_price}
      />
    </>
  );
}
