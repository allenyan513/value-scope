import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { DCFCards } from "@/components/valuation/dcf-cards";
import { getTickerData } from "../data";

interface Props {
  params: Promise<{ ticker: string }>;
}

import { PAGE_REVALIDATE } from "@/lib/constants";
export const revalidate = PAGE_REVALIDATE;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} DCF Valuation — Discounted Cash Flow Analysis${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} DCF valuation using Free Cash Flow to Equity (FCFE) with 5-year projection. Includes sensitivity analysis and discount rate breakdown.`,
  };
}

export default async function DCFValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary } = await getTickerData(upperTicker);

  if (!summary) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for DCF analysis.
      </p>
    );
  }

  const dcfModel = summary.models.find(
    (m) => m.model_type === "dcf_growth_exit_5y"
  );

  if (!dcfModel || dcfModel.fair_value === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        DCF model not available — insufficient financial data.
      </p>
    );
  }

  return (
    <>
      <h2 className="text-xl font-bold mb-6">
        Discounted Cash Flow (DCF) Valuation
      </h2>
      <DCFCards
        model={dcfModel}
        currentPrice={summary.current_price}
        wacc={summary.wacc}
      />
    </>
  );
}
