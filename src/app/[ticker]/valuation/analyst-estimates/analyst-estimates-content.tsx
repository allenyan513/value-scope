import { Suspense } from "react";
import { AnalystConsensusHero } from "@/components/valuation/analyst-consensus-hero";
import { RatingDistribution } from "@/components/valuation/rating-distribution";
import { PriceTargetsSummary } from "@/components/valuation/price-targets-summary";
import { EstimateChart } from "@/components/valuation/estimate-chart";
import { QuarterlyEarningsTable } from "@/components/valuation/quarterly-earnings-table";
import { getAnalystData, getCoreTickerData } from "../../data";

interface Props {
  ticker: string;
}

/** Async server component — fetches all analyst data and renders the 6-section layout. */
export async function AnalystEstimatesContent({ ticker }: Props) {
  const [core, analyst] = await Promise.all([
    getCoreTickerData(ticker),
    getAnalystData(ticker),
  ]);

  const { company, estimates, historicals } = core;
  const {
    priceTargets,
    earningsSurprises,
    priceHistory,
    recommendations,
    upgradesDowngrades,
    nextEarningsDate,
  } = analyst;
  const currentPrice = core.summary?.current_price ?? company?.price ?? 0;

  return (
    <>
      {/* Section 1: Analyst Consensus Hero */}
      <AnalystConsensusHero
        ticker={ticker}
        companyName={company?.name ?? ticker}
        currentPrice={currentPrice}
        recommendations={recommendations}
        priceTargets={priceTargets}
        nextEarningsDate={nextEarningsDate}
      />

      {/* Section 2: Rating Distribution */}
      {recommendations && recommendations.totalAnalysts > 0 && (
        <Suspense fallback={<div className="h-48 animate-pulse bg-muted rounded-lg" />}>
          <RatingDistribution
            recommendations={recommendations}
            upgradesDowngrades={upgradesDowngrades}
          />
        </Suspense>
      )}

      {/* Section 3: Price Targets */}
      {priceTargets && company ? (
        <PriceTargetsSummary
          ticker={ticker}
          companyName={company.name}
          currentPrice={currentPrice}
          priceTargets={priceTargets}
          priceHistory={priceHistory}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No price target data available for {ticker}.
        </p>
      )}

      {/* Section 4: EPS Estimates */}
      <EstimateChart
        title="EPS"
        metricType="eps"
        ticker={ticker}
        companyName={company?.name ?? ticker}
        financials={historicals}
        estimates={estimates}
        earningsSurprises={earningsSurprises}
      />

      {/* Section 5: Revenue Estimates */}
      <EstimateChart
        title="Revenue"
        metricType="revenue"
        ticker={ticker}
        companyName={company?.name ?? ticker}
        financials={historicals}
        estimates={estimates}
      />

      {/* Section 6: Quarterly Earnings History */}
      <QuarterlyEarningsTable
        earningsSurprises={earningsSurprises}
      />
    </>
  );
}
