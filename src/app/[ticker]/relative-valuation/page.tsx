import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { ModelCard } from "@/components/valuation/model-card";
import { getTickerData } from "../data";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Relative Valuation — P/E & EV/EBITDA Multiples${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} relative valuation using P/E multiples, EV/EBITDA multiples, and Peter Lynch fair value with peer comparison.`,
  };
}

export default async function RelativeValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary } = await getTickerData(upperTicker);

  if (!summary) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for relative valuation.
      </p>
    );
  }

  const relativeModels = summary.models.filter(
    (m) =>
      m.model_type === "pe_multiples" ||
      m.model_type === "ev_ebitda_multiples" ||
      m.model_type === "peter_lynch"
  );

  return (
    <>
      <h2 className="text-xl font-bold mb-6">Relative Valuation</h2>
      <div className="space-y-6">
        {relativeModels.map((model) => (
          <ModelCard
            key={model.model_type}
            model={model}
            currentPrice={summary.current_price}
          />
        ))}
      </div>
    </>
  );
}
