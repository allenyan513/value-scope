import { getCoreTickerData } from "../data";
import { DCFModelNav } from "@/components/valuation/dcf-model-nav";
interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export default async function DCFLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary } = await getCoreTickerData(upperTicker);

  const models = summary?.models.filter((m) =>
    ["dcf_3stage", "dcf_pe_exit_10y", "dcf_ebitda_exit_fcfe_10y"].includes(m.model_type)
    && m.fair_value > 0
  ) ?? [];

  return (
    <>
      <h2 className="text-xl font-bold mb-6">
        Discounted Cash Flow (DCF) Valuation
      </h2>
      {models.length > 0 && (
        <DCFModelNav
          ticker={upperTicker}
          models={models}
          currentPrice={summary?.current_price ?? 0}
        />
      )}
      {children}
    </>
  );
}
