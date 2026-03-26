import { PriceValueChart } from "@/components/charts/price-value-chart";
import { getChartHistory } from "../../data";

interface Props {
  ticker: string;
}

/** Async server component — fetches chart data and renders PriceValueChart. */
export async function ValuationChartSection({ ticker }: Props) {
  const data = await getChartHistory(ticker);
  return <PriceValueChart data={data} />;
}
