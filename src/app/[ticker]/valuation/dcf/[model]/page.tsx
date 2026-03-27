import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompany } from "@/lib/db/queries";
import { DCFCards } from "@/components/valuation/dcf-cards";
import { DCFFCFFCards } from "@/components/valuation/dcf-fcff-cards";
import { MethodologyCard } from "@/components/valuation/methodology-card";
import { getCoreTickerData } from "../../../data";
import { generateDCFNarrative } from "@/lib/valuation/dcf-narrative";
import type { ValuationModelType } from "@/types";

const MODEL_MAP: Record<string, { modelType: ValuationModelType; label: string; metaTitle: string; metaDesc: string; methodology: string[] }> = {
  "perpetual-growth": {
    modelType: "dcf_3stage",
    label: "Perpetual Growth (10Y)",
    metaTitle: "DCF Perpetual Growth Valuation",
    metaDesc: "Discounted Cash Flow valuation using Gordon Growth perpetual terminal value. 10-year projection with analyst estimates (Y1–5) and transition phase (Y6–10).",
    methodology: [
      "This is a 3-stage Free Cash Flow to Equity (FCFE) model. Stage 1 (Years 1–5) uses analyst consensus revenue and margin estimates. Stage 2 (Years 6–10) transitions growth from the analyst trajectory toward a long-term sustainable rate. The terminal value is calculated using the Gordon Growth Model, assuming cash flows grow at a perpetual rate tied to nominal GDP growth.",
      "Fair value equals the present value of projected FCFE plus terminal value, adjusted for cash and debt, divided by shares outstanding. The discount rate is the cost of equity derived from CAPM. The sensitivity matrix shows how fair value changes under different discount rate and terminal growth assumptions.",
    ],
  },
  "pe-exit": {
    modelType: "dcf_pe_exit_10y",
    label: "P/E Exit (10Y)",
    metaTitle: "DCF P/E Exit Multiple Valuation",
    metaDesc: "Discounted Cash Flow valuation using P/E exit multiple for terminal value. 10-year projection with historical P/E ratio applied at exit.",
    methodology: [
      "This model projects Free Cash Flow to Equity over 10 years using the same 3-stage approach (analyst estimates → transition → steady state), but replaces the Gordon Growth terminal value with a P/E exit multiple. The terminal value is calculated as Year 10 net income multiplied by the company's historical 5-year average P/E ratio.",
      "Using an exit multiple anchors the terminal value to how the market has historically priced the company's earnings, rather than assuming perpetual growth. This approach tends to produce more conservative results when the stock's historical P/E is below its current trading multiple.",
    ],
  },
  "ev-ebitda-exit": {
    modelType: "dcf_ebitda_exit_fcfe_10y",
    label: "EV/EBITDA Exit (10Y)",
    metaTitle: "DCF EV/EBITDA Exit Multiple Valuation",
    metaDesc: "Discounted Cash Flow valuation using EV/EBITDA exit multiple for terminal value. 10-year projection with enterprise value conversion.",
    methodology: [
      "This model uses the same 10-year FCFE projection as the other DCF variants, but calculates terminal value using an EV/EBITDA exit multiple. Year 10 EBITDA is multiplied by the company's historical 5-year average EV/EBITDA ratio to arrive at an enterprise value, which is then converted to equity value by subtracting net debt.",
      "EV/EBITDA is capital-structure neutral, making it useful for comparing companies with different leverage levels. This approach works best for capital-intensive businesses where EBITDA is a better proxy for operating performance than net income.",
    ],
  },
  "fcff-growth-5y": {
    modelType: "dcf_fcff_growth_5y",
    label: "FCFF Growth (5Y)",
    metaTitle: "FCFF DCF Growth Exit Valuation",
    metaDesc: "Unlevered DCF valuation using Free Cash Flow to Firm (FCFF) with Gordon Growth terminal value. 5-year projection with line-by-line expense modeling, D&A vintage schedule, and working capital analysis.",
    methodology: [
      "This is an unlevered Free Cash Flow to Firm (FCFF) model with a 5-year projection period. Revenue is projected using analyst consensus estimates, while expenses (COGS, SG&A, R&D, Interest) are modeled as individual line items based on historical ratios. Depreciation is calculated from a vintage matrix that tracks each year's CapEx depreciated straight-line over its useful life. Working capital is projected using historical turnover days (DSO, DPO, DIO).",
      "FCFF equals EBITDA minus taxes, capital expenditure, and change in net working capital. The terminal value is calculated using the Gordon Growth Model on the Year 6 FCFF. Cash flows are discounted at the Weighted Average Cost of Capital (WACC) using mid-year convention. Enterprise value is converted to equity value by subtracting net debt (total debt minus cash).",
    ],
  },
  "fcff-growth-10y": {
    modelType: "dcf_fcff_growth_10y",
    label: "FCFF Growth (10Y)",
    metaTitle: "FCFF DCF Growth Exit 10-Year Valuation",
    metaDesc: "Unlevered DCF valuation using Free Cash Flow to Firm (FCFF) with Gordon Growth terminal value. 10-year projection with line-by-line expense modeling, revenue fade-to-GDP growth, D&A vintage schedule, and working capital analysis.",
    methodology: [
      "This is an unlevered Free Cash Flow to Firm (FCFF) model with a 10-year projection period. Revenue is projected using analyst consensus estimates for the first 3–5 years, then gradually fading toward long-term GDP growth (~3%) for the remaining years. Expenses (COGS, SG&A, R&D, Interest) are modeled as individual line items based on historical ratios. Depreciation is calculated from a vintage matrix that tracks each year's CapEx depreciated straight-line over its useful life. Working capital is projected using historical turnover days (DSO, DPO, DIO).",
      "The longer 10-year horizon reduces the weight of the terminal value in the total enterprise value, making the model less sensitive to terminal growth assumptions. FCFF equals EBITDA minus taxes, capital expenditure, and change in net working capital. The terminal value is calculated using the Gordon Growth Model on the Year 11 FCFF. Cash flows are discounted at the Weighted Average Cost of Capital (WACC) using mid-year convention. Enterprise value is converted to equity value by subtracting net debt (total debt minus cash).",
    ],
  },
};

interface Props {
  params: Promise<{ ticker: string; model: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

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

  const { summary } = await getCoreTickerData(upperTicker);
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

  const isFCFF = config.modelType === "dcf_fcff_growth_5y" || config.modelType === "dcf_fcff_growth_10y";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {isFCFF ? (
        <DCFFCFFCards
          model={dcfModel}
          currentPrice={summary.current_price}
          narrative={narrative}
        />
      ) : (
        <DCFCards
          model={dcfModel}
          currentPrice={summary.current_price}
          narrative={narrative}
        />
      )}
      <MethodologyCard paragraphs={config.methodology} />
    </>
  );
}
