import { Suspense } from "react";
import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { TickerPending } from "@/components/provisioning/ticker-pending";
import { getCoreTickerData } from "../../data";
import { ValuationChartSection } from "./valuation-chart-section";
import { SummaryWithStrategy } from "./summary-with-strategy";
import { WallStreetSection } from "./wall-street-section";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  if (!company) {
    return { title: `${upperTicker} — Stock Valuation` };
  }

  return {
    title: `${upperTicker} Intrinsic Value & Fair Price — ${company.name} | ValuScope`,
    description: `What is the intrinsic value of ${company.name} (${upperTicker})? Is ${upperTicker} undervalued or overvalued? See valuation models including DCF, P/E, P/S, P/B with transparent assumptions. Updated daily.`,
    openGraph: {
      title: `${upperTicker} Intrinsic Value — Is ${company.name} Undervalued? | ValuScope`,
      description: `${company.name} (${upperTicker}) intrinsic value analysis using 7 models. Current price: $${company.price?.toFixed(2)} USD.`,
    },
  };
}

export default async function SummaryPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const data = await getCoreTickerData(upperTicker);

  if (data.pending || !data.company) {
    return <TickerPending ticker={upperTicker} />;
  }

  const { company } = data;
  const summary = data.summary;

  if (!summary) {
    return (
      <div className="py-8 text-center">
        <h2 className="val-h2">
          {company.name} ({upperTicker})
        </h2>
        <p className="text-muted-foreground">
          Financial data is being prepared. Please check back soon.
        </p>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${upperTicker} Stock Valuation — ${company.name}`,
    description: `Intrinsic value analysis for ${company.name} (${upperTicker}) using 7 valuation models.`,
    provider: {
      "@type": "Organization",
      name: "ValuScope",
      url: "https://valuscope.com",
    },
    offers: {
      "@type": "Offer",
      price: summary.current_price.toFixed(2),
      priceCurrency: "USD",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Client component handles ?strategy= param without breaking ISR */}
      <SummaryWithStrategy
        defaultSummary={summary}
        ticker={upperTicker}
        company={data.company}
        historicals={data.historicals}
        estimates={data.estimates}
        peers={data.peers}
        historicalMultiples={data.historicalMultiples}
        riskFreeRate={summary.wacc.risk_free_rate}
        currentPrice={summary.current_price}
      />

      {/* ValuScope vs Wall Street */}
      <Suspense
        fallback={<div className="mt-8 h-48 animate-pulse bg-muted rounded-lg" />}
      >
        <div className="mt-8">
          <WallStreetSection
            ticker={upperTicker}
            companyName={company.name}
            currentPrice={summary.current_price}
            consensusFairValue={summary.consensus_fair_value}
            consensusUpside={summary.consensus_upside}
          />
        </div>
      </Suspense>

      {/* Price vs Intrinsic Value Chart */}
      <div className="mt-8 val-card">
        <h3 className="val-card-title">Valuation History</h3>
        <Suspense
          fallback={
            <div className="h-80 flex items-center justify-center text-muted-foreground animate-pulse">
              Loading chart...
            </div>
          }
        >
          <ValuationChartSection ticker={upperTicker} />
        </Suspense>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-muted-foreground border-t pt-6 mt-10">
        <p>
          <strong>Disclaimer:</strong> ValuScope provides estimated intrinsic
          values for informational purposes only. This is not financial advice.
          All models rely on assumptions that may not reflect future performance.
          Always do your own research before making investment decisions. Data
          sourced from SEC filings via Financial Modeling Prep. Last updated:{" "}
          {new Date(summary.computed_at).toLocaleDateString()}.
        </p>
      </div>
    </>
  );
}
