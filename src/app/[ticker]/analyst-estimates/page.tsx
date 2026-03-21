import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { AnalystEstimatesTable } from "@/components/valuation/analyst-estimates-table";
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
    title: `${upperTicker} Analyst Estimates — Consensus EPS & Revenue${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} analyst consensus estimates for revenue and EPS. See low, average, and high estimates across analyst coverage.`,
  };
}

export default async function AnalystEstimatesPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary, estimates } = await getTickerData(upperTicker);

  const currentPrice = summary?.current_price ?? 0;

  return (
    <>
      <h2 className="text-xl font-bold mb-6">Analyst Estimates</h2>
      <AnalystEstimatesTable
        estimates={estimates}
        currentPrice={currentPrice}
      />
    </>
  );
}
