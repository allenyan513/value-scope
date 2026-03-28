import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../../data";
import { formatCurrency, formatLargeNumber } from "@/lib/format";
import { ValuationHero } from "@/components/valuation/valuation-hero";
import { MethodologyCard } from "@/components/valuation/methodology-card";
import { EPVBreakdown } from "@/components/valuation/epv-breakdown";
import type { EPVDetails } from "@/lib/valuation/epv";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Earnings Power Value${company ? ` — ${company.name}` : ""} | ValuScope`,
    description: `Earnings Power Value (EPV) analysis for ${company?.name ?? upperTicker} (${upperTicker}). Perpetuity-based valuation using normalized earnings and WACC. Updated daily.`,
  };
}

export default async function EPVPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { company, summary } = await getCoreTickerData(upperTicker);

  if (!summary || !company) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for EPV analysis.
      </p>
    );
  }

  const model = summary.models.find((m) => m.model_type === "epv");
  if (!model || model.fair_value === 0) {
    const note = model?.assumptions && "note" in model.assumptions
      ? String(model.assumptions.note)
      : "requires positive normalized earnings and at least 2 years of data";
    return (
      <p className="text-muted-foreground py-8 text-center">
        Earnings Power Value not available — {note}.
      </p>
    );
  }

  const d = model.details as unknown as EPVDetails;
  const currentPrice = summary.current_price;
  const upside = model.upside_percent;

  return (
    <div className="val-page">
      <h2 className="val-h2">
        {company.name} ({upperTicker}) Earnings Power Value
      </h2>

      <ValuationHero
        fairValue={model.fair_value}
        currentPrice={currentPrice}
        upside={upside}
        narrative={
          <>
            Using the Earnings Power Value framework with a WACC of{" "}
            {(d.wacc * 100).toFixed(1)}% and normalized earnings of{" "}
            {formatLargeNumber(d.normalized_earnings)}, {company.name} has a
            fair value of {formatCurrency(model.fair_value)} per share.
            The EPV range is {formatCurrency(model.low_estimate)} –{" "}
            {formatCurrency(model.high_estimate)} based on WACC sensitivity
            ({(d.wacc_low * 100).toFixed(1)}% – {(d.wacc_high * 100).toFixed(1)}%).
          </>
        }
      />

      {/* Tabbed breakdown */}
      <EPVBreakdown details={d} model={model} />

      <MethodologyCard paragraphs={[
        "Earnings Power Value (EPV) estimates what a company is worth based on its current normalized earnings, assuming zero growth. It values the business as a perpetuity: Normalized Earnings / WACC. This gives a conservative floor value — the company's worth if it never grows but maintains its current profitability.",
        "The model normalizes earnings by: (1) using sustainable gross margins (5-year average) applied to current revenue, (2) deducting maintenance-level operating expenses (average R&D + SG&A as % of revenue), (3) applying the average effective tax rate, and (4) subtracting the average excess of CapEx over D&A (net reinvestment needed to maintain current capacity).",
        "EPV is most useful as a comparison anchor: if the market price is below EPV, the stock may be undervalued even without any growth. If market price exceeds EPV, the premium reflects growth expectations — which may or may not materialize.",
      ]} />
    </div>
  );
}
