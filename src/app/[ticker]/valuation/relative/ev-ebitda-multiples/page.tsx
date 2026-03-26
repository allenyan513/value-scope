import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getRelativeValuationData } from "../data";
import { RelativeValuationSection } from "../section";
import { MethodologyCard } from "@/components/valuation/methodology-card";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} EV/EBITDA Multiples — Trading Multiples${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} EV/EBITDA relative valuation using peer comparison with transparent calculation breakdown.`,
  };
}

export default async function EVEBITDAMultiplesPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { evData, error } = await getRelativeValuationData(upperTicker);

  if (error || !evData) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        {error ?? "EV/EBITDA multiples data not available."}
      </p>
    );
  }

  return (
    <>
      <RelativeValuationSection data={evData} />
      <MethodologyCard paragraphs={[
        "The EV/EBITDA Multiples model estimates fair value using the Enterprise Value to EBITDA ratio. When sufficient historical data is available (100+ daily data points), the company's own 5-year average EV/EBITDA is used. Otherwise, the median of industry peers serves as a fallback.",
        "Enterprise Value = EV/EBITDA × EBITDA. Equity value is then derived by subtracting net debt from enterprise value and dividing by shares outstanding. EV/EBITDA is capital-structure neutral, making it particularly useful for comparing companies across different leverage profiles and for capital-intensive industries.",
      ]} />
    </>
  );
}
