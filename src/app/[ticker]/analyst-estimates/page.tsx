import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { PriceTargetsSummary } from "@/components/valuation/price-targets-summary";
import { EstimateChart } from "@/components/valuation/estimate-chart";
import { getTickerData } from "../data";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Analyst Estimates — Price Targets, EPS & Revenue${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} analyst price targets, EPS and revenue estimates with historical accuracy, beat/miss tracking, and growth projections.`,
  };
}

export default async function AnalystEstimatesPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const {
    company,
    summary,
    estimates,
    historicals,
    priceTargets,
    earningsSurprises,
    priceHistory,
  } = await getTickerData(upperTicker);

  const currentPrice = summary?.current_price ?? company.price ?? 0;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold">Analyst Estimates</h2>

      {/* Module 1: Price Targets Summary */}
      {priceTargets ? (
        <PriceTargetsSummary
          ticker={upperTicker}
          companyName={company.name}
          currentPrice={currentPrice}
          priceTargets={priceTargets}
          priceHistory={priceHistory}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No price target data available for {upperTicker}.
        </p>
      )}

      {/* Module 2: EPS Estimates */}
      <EstimateChart
        title="EPS"
        metricType="eps"
        ticker={upperTicker}
        companyName={company.name}
        financials={historicals}
        estimates={estimates}
        earningsSurprises={earningsSurprises}
      />

      {/* Module 3: Revenue Estimates */}
      <EstimateChart
        title="Revenue"
        metricType="revenue"
        ticker={upperTicker}
        companyName={company.name}
        financials={historicals}
        estimates={estimates}
      />
    </div>
  );
}
