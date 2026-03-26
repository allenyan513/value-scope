import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getRelativeValuationData } from "../data";
import { RelativeValuationSection } from "../section";

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

  return <RelativeValuationSection data={peData} />;
}
