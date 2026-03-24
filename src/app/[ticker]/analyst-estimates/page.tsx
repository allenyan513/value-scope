import { Suspense } from "react";
import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../data";
import { PriceTargetsSection } from "./price-targets-section";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

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
  const { company } = await getCoreTickerData(upperTicker);

  if (!company) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Data is being prepared for {upperTicker}. Please check back later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold">Analyst Estimates</h2>

      <Suspense
        fallback={
          <div className="space-y-6">
            <div className="h-48 animate-pulse bg-muted rounded-lg" />
            <div className="h-64 animate-pulse bg-muted rounded-lg" />
            <div className="h-64 animate-pulse bg-muted rounded-lg" />
          </div>
        }
      >
        <PriceTargetsSection ticker={upperTicker} />
      </Suspense>
    </div>
  );
}
