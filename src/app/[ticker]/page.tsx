import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { SummaryCard } from "@/components/valuation/summary-card";
import { PriceValueChart } from "@/components/charts/price-value-chart";
import { ModelCardCompact } from "@/components/valuation/model-card-compact";
import { getTickerData } from "./data";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

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
  const data = await getTickerData(upperTicker);

  // Ticker not in DB at all — data request has been enqueued
  if (data.pending || !data.company) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h2 className="text-xl font-bold mb-3">{upperTicker}</h2>
        <p className="text-muted-foreground mb-2">
          We don&apos;t have data for this ticker yet.
        </p>
        <p className="text-sm text-muted-foreground">
          It has been queued for processing. Please check back later.
        </p>
      </div>
    );
  }

  const { company, summary } = data;

  if (!summary) {
    return (
      <div className="py-8 text-center">
        <h2 className="text-xl font-bold mb-4">
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

      {/* Valuation Summary */}
      <SummaryCard summary={summary} />

      {/* Price vs Intrinsic Value Chart */}
      <div className="mt-8 rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">
          Valuation History
        </h2>
        <PriceValueChart ticker={upperTicker} />
      </div>

      {/* All Models Overview */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Valuation Models</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {summary.models.map((model) => (
            <ModelCardCompact
              key={model.model_type}
              model={model}
              ticker={upperTicker}
            />
          ))}
        </div>
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
