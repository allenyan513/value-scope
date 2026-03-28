import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompany, computePeerEBITDAMultiples } from "@/lib/db/queries";
import { DCFFCFFCards } from "@/components/valuation/dcf-fcff-cards";
import { DCFFCFFEBITDAExitCards } from "@/components/valuation/dcf-fcff-ebitda-exit-cards";
import { MethodologyCard } from "@/components/valuation/methodology-card";
import { getCoreTickerData } from "../../../data";
import { generateDCFNarrative } from "@/lib/valuation/dcf-narrative";
import type { ValuationModelType } from "@/types";

const MODEL_MAP: Record<string, { modelType: ValuationModelType; label: string; metaTitle: string; metaDesc: string; methodology: string[] }> = {
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
  "fcff-ebitda-exit-5y": {
    modelType: "dcf_fcff_ebitda_exit_5y",
    label: "FCFF EBITDA Exit (5Y)",
    metaTitle: "FCFF DCF EBITDA Exit 5-Year Valuation",
    metaDesc: "Unlevered DCF valuation using Free Cash Flow to Firm (FCFF) with peer EV/EBITDA exit multiple for terminal value. 5-year projection anchored to industry peer valuations.",
    methodology: [
      "This is an unlevered Free Cash Flow to Firm (FCFF) model with a 5-year projection period. Revenue, expenses, D&A, and working capital are projected using the same line-by-line approach as the Growth Exit models. The key difference is the terminal value methodology: instead of assuming perpetual cash flow growth, the terminal value is calculated by applying the industry peer median EV/EBITDA multiple to the projected Year 6 EBITDA.",
      "Using a peer exit multiple anchors the terminal value to how the market currently prices comparable companies, rather than relying on a theoretical perpetual growth assumption. This approach captures relative valuation dynamics and is particularly useful when a company is expected to converge toward industry-average profitability over time. The sensitivity matrix shows how fair value changes across different WACC and EV/EBITDA multiple scenarios.",
    ],
  },
  "fcff-ebitda-exit-10y": {
    modelType: "dcf_fcff_ebitda_exit_10y",
    label: "FCFF EBITDA Exit (10Y)",
    metaTitle: "FCFF DCF EBITDA Exit 10-Year Valuation",
    metaDesc: "Unlevered DCF valuation using Free Cash Flow to Firm (FCFF) with peer EV/EBITDA exit multiple for terminal value. 10-year projection with revenue fade-to-GDP growth, anchored to industry peer valuations.",
    methodology: [
      "This is an unlevered Free Cash Flow to Firm (FCFF) model with a 10-year projection period. Revenue is projected using analyst consensus estimates for the first 3–5 years, then gradually fading toward long-term GDP growth (~3%) for the remaining years. Expenses, D&A, and working capital follow the same line-by-line approach as the 5-year variant. The terminal value is calculated by applying the industry peer median EV/EBITDA multiple to the projected Year 11 EBITDA.",
      "The longer 10-year horizon reduces the weight of the terminal value in the total enterprise value, making the model less sensitive to the exit multiple assumption. This approach combines the advantages of detailed FCFF modeling with a market-anchored exit, providing a more robust valuation for companies where long-term fundamentals are expected to converge toward industry norms. The sensitivity matrix shows how fair value changes across different WACC and EV/EBITDA multiple scenarios.",
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

  // Peer EBITDA table — only needed for the EBITDA Exit models
  const peerEBITDARows = (config.modelType === "dcf_fcff_ebitda_exit_5y" || config.modelType === "dcf_fcff_ebitda_exit_10y")
    ? await computePeerEBITDAMultiples(upperTicker).catch(() => [])
    : [];

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

  const isEBITDAExit = config.modelType === "dcf_fcff_ebitda_exit_5y" || config.modelType === "dcf_fcff_ebitda_exit_10y";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {isEBITDAExit ? (
        <DCFFCFFEBITDAExitCards
          model={dcfModel}
          currentPrice={summary.current_price}
          narrative={narrative}
          peers={peerEBITDARows}
        />
      ) : (
        <DCFFCFFCards
          model={dcfModel}
          currentPrice={summary.current_price}
          narrative={narrative}
        />
      )}
      <MethodologyCard paragraphs={config.methodology} />
    </>
  );
}
