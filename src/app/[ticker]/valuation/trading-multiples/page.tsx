import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getRelativeValuationData } from "./data";
import { ValuationHero } from "@/components/valuation/valuation-hero";
import { MethodologyCard } from "@/components/valuation/methodology-card";
import { MultiplesDetailView } from "./multiples-detail";
import { ConsensusBreakdown } from "./consensus-breakdown";
import { HistoricalMultiplesChart } from "./historical-chart";
import { formatCurrency } from "@/lib/format";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} Trading Multiples — Relative Valuation${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} relative valuation using P/E and EV/EBITDA multiples with industry peer comparison (trailing + forward).`,
  };
}

export default async function RelativeValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const data = await getRelativeValuationData(upperTicker);

  if (!data) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Data not yet available for trading multiples analysis.
      </p>
    );
  }

  const validMultiples = data.multiples.filter((m) => m.fairValue !== null && m.fairValue > 0);
  const multipleLabels = validMultiples.map((m) => m.label).join(" and ");

  return (
    <>
      {/* 1. Hero */}
      {data.consensusFairValue > 0 && (
        <ValuationHero
          fairValue={data.consensusFairValue}
          currentPrice={data.currentPrice}
          upside={data.consensusUpside}
          narrative={
            <>
              Using industry peer median {multipleLabels} multiples (trailing + forward),{" "}
              {data.companyName} ({data.ticker}) has a fair value of{" "}
              {formatCurrency(data.consensusFairValue)} based on {data.peers.length} comparable
              companies in the {data.industry} industry.
            </>
          }
        />
      )}

      {/* 2. Multiples Detail — tabbed P/E vs EV/EBITDA with peer table + bridge */}
      <MultiplesDetailView
        multiples={data.multiples}
        peers={data.peers}
        companyRow={data.companyRow}
        currentPrice={data.currentPrice}
        industry={data.industry}
      />

      {/* 3. Historical Chart */}
      <HistoricalMultiplesChart ticker={upperTicker} />

      {/* 4. Consensus Breakdown */}
      <ConsensusBreakdown
        multiples={data.multiples}
        consensusFairValue={data.consensusFairValue}
        currentPrice={data.currentPrice}
      />

      {/* 5. Methodology */}
      <MethodologyCard paragraphs={[
        "This relative valuation uses industry peer median multiples — P/E (Price-to-Earnings) and EV/EBITDA (Enterprise Value to EBITDA) — to estimate fair value. Both trailing (last 12 months) and forward (next fiscal year analyst estimates) multiples are computed independently.",
        "For P/E: the industry median trailing P/E is applied to the company's net income, and the forward P/E to analyst-estimated net income. For EV/EBITDA: the industry median is applied to EBITDA, producing an enterprise value from which net debt is subtracted to arrive at equity value per share. The selected fair price for each multiple is the average of its trailing and forward legs.",
        "The consensus fair value is the median across P/E and EV/EBITDA selected fair prices. Using peer-based multiples provides a market-relative anchor, while combining trailing and forward perspectives reduces sensitivity to any single period's results.",
      ]} />
    </>
  );
}
