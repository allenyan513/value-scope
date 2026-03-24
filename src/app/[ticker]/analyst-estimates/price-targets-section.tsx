import { PriceTargetsSummary } from "@/components/valuation/price-targets-summary";
import { EstimateChart } from "@/components/valuation/estimate-chart";
import { getAnalystData, getCoreTickerData } from "../data";
import type { EarningsSurprise } from "@/types";

interface Props {
  ticker: string;
}

/** Async server component — fetches analyst data (price targets, earnings surprises) and renders. */
export async function PriceTargetsSection({ ticker }: Props) {
  const [core, analyst] = await Promise.all([
    getCoreTickerData(ticker),
    getAnalystData(ticker),
  ]);

  const { company, estimates, historicals } = core;
  const { priceTargets, earningsSurprises, priceHistory } = analyst;
  const currentPrice = core.summary?.current_price ?? company?.price ?? 0;

  return (
    <>
      {/* Price Targets */}
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

      {/* EPS Estimates (includes earnings surprises) */}
      <EstimateChart
        title="EPS"
        metricType="eps"
        ticker={ticker}
        companyName={company?.name ?? ticker}
        financials={historicals}
        estimates={estimates}
        earningsSurprises={earningsSurprises}
      />

      {/* Revenue Estimates */}
      <EstimateChart
        title="Revenue"
        metricType="revenue"
        ticker={ticker}
        companyName={company?.name ?? ticker}
        financials={historicals}
        estimates={estimates}
      />
    </>
  );
}
