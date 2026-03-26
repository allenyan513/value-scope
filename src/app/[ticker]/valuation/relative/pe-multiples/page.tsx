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
    title: `${upperTicker} P/E Multiples — Trading Multiples${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} P/E relative valuation using peer comparison with transparent calculation breakdown.`,
  };
}

export default async function PEMultiplesPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { peData, error } = await getRelativeValuationData(upperTicker);

  if (error || !peData) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        {error ?? "P/E multiples data not available."}
      </p>
    );
  }

  return (
    <>
      <RelativeValuationSection data={peData} />
      <MethodologyCard paragraphs={[
        "The P/E Multiples model estimates fair value by applying a historical average P/E ratio to the company's trailing earnings per share. When at least 100 daily data points are available, the model uses the company's own 5-year average P/E. Otherwise, it falls back to the median P/E of industry peers.",
        "Fair Value = Historical Avg P/E × Trailing EPS. The range is derived from the 25th and 75th percentile of historical P/E values. This approach assumes the market's long-term valuation of a company's earnings is a reasonable anchor, while providing context on where the current multiple sits relative to its own history.",
      ]} />
    </>
  );
}
