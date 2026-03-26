import { WallStreetComparison } from "@/components/valuation/wall-street-comparison";
import { getAnalystData } from "../../data";

interface Props {
  ticker: string;
  companyName: string;
  currentPrice: number;
  consensusFairValue: number;
  consensusUpside: number;
}

/** Async server component — fetches analyst data for the Wall Street comparison. */
export async function WallStreetSection({
  ticker,
  companyName,
  currentPrice,
  consensusFairValue,
  consensusUpside,
}: Props) {
  const analyst = await getAnalystData(ticker);

  return (
    <WallStreetComparison
      ticker={ticker}
      companyName={companyName}
      currentPrice={currentPrice}
      consensusFairValue={consensusFairValue}
      consensusUpside={consensusUpside}
      priceTargets={analyst.priceTargets}
      recommendations={analyst.recommendations}
    />
  );
}
