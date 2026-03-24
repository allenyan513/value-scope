import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompany } from "@/lib/db/queries";
import { DCFCards } from "@/components/valuation/dcf-cards";
import { getTickerData } from "../../data";
import { generateDCFNarrative } from "@/lib/valuation/dcf-narrative";
import type { ValuationModelType } from "@/types";

const MODEL_MAP: Record<string, { modelType: ValuationModelType; label: string; metaTitle: string; metaDesc: string }> = {
  "perpetual-growth": {
    modelType: "dcf_3stage",
    label: "Perpetual Growth (10Y)",
    metaTitle: "DCF Perpetual Growth Valuation",
    metaDesc: "Discounted Cash Flow valuation using Gordon Growth perpetual terminal value. 10-year projection with analyst estimates (Y1–5) and transition phase (Y6–10).",
  },
  "pe-exit": {
    modelType: "dcf_pe_exit_10y",
    label: "P/E Exit (10Y)",
    metaTitle: "DCF P/E Exit Multiple Valuation",
    metaDesc: "Discounted Cash Flow valuation using P/E exit multiple for terminal value. 10-year projection with historical P/E ratio applied at exit.",
  },
  "ev-ebitda-exit": {
    modelType: "dcf_ebitda_exit_fcfe_10y",
    label: "EV/EBITDA Exit (10Y)",
    metaTitle: "DCF EV/EBITDA Exit Multiple Valuation",
    metaDesc: "Discounted Cash Flow valuation using EV/EBITDA exit multiple for terminal value. 10-year projection with enterprise value conversion.",
  },
};

interface Props {
  params: Promise<{ ticker: string; model: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker, model } = await params;
  const upperTicker = ticker.toUpperCase();
  const config = MODEL_MAP[model];
  if (!config) return { title: "Not Found" };

  const company = await getCompany(upperTicker);
  const companyName = company?.name ?? upperTicker;

  return {
    title: `${upperTicker} ${config.metaTitle}${company ? ` — ${companyName}` : ""} | ValuScope`,
    description: `${companyName} (${upperTicker}) ${config.metaDesc.toLowerCase()}`,
  };
}

export default async function DCFModelPage({ params }: Props) {
  const { ticker, model } = await params;
  const upperTicker = ticker.toUpperCase();
  const config = MODEL_MAP[model];

  if (!config) notFound();

  const { summary } = await getTickerData(upperTicker);
  if (!summary) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for DCF analysis.
      </p>
    );
  }

  const dcfModel = summary.models.find((m) => m.model_type === config.modelType);
  if (!dcfModel || dcfModel.fair_value === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        {config.label} not available — insufficient data.
      </p>
    );
  }

  const narrative = generateDCFNarrative(
    dcfModel,
    summary.company_name,
    upperTicker,
    summary.current_price
  );

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${upperTicker} ${config.label} — ${summary.company_name}`,
    description: narrative,
    provider: {
      "@type": "Organization",
      name: "ValuScope",
      url: "https://valuscope.com",
    },
    offers: {
      "@type": "Offer",
      price: dcfModel.fair_value.toFixed(2),
      priceCurrency: "USD",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DCFCards
        model={dcfModel}
        currentPrice={summary.current_price}
        wacc={summary.wacc}
        narrative={narrative}
      />
    </>
  );
}
