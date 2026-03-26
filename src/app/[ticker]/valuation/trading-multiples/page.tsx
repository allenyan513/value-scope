import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getRelativeValuationData } from "./data";
import { ValuationHero } from "@/components/valuation/valuation-hero";
import { MethodologyCard } from "@/components/valuation/methodology-card";
import { MultiplesOverview } from "./multiples-overview";
import { HistoricalMultiplesChart } from "./historical-chart";
import { PeerComparisonTable } from "./peer-table";
import { MultipleBreakdownCards } from "./multiple-breakdown";
import { ConsensusBreakdown } from "./consensus-breakdown";
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
    description: `${company?.name ?? upperTicker} relative valuation using P/E, EV/EBITDA, P/B, P/S, and P/FCF multiples with historical analysis and peer comparison.`,
  };
}

export default async function RelativeValuationPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const data = await getRelativeValuationData(upperTicker);

  if (!data) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Historical data not yet available for trading multiples analysis.
      </p>
    );
  }

  const validMultiples = data.multiples.filter((m) => m.fairValue !== null && m.fairValue > 0);
  const multipleLabels = validMultiples.map((m) => m.label).join(", ");

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
              Based on a multi-multiple relative valuation ({multipleLabels}),{" "}
              {data.companyName} ({data.ticker}) has a consensus fair value of{" "}
              {formatCurrency(data.consensusFairValue)}, taking the median across{" "}
              {validMultiples.length} trading multiple models.
            </>
          }
        />
      )}

      {/* 2. Multiples Overview Grid */}
      <MultiplesOverview multiples={data.multiples} />

      {/* 3. Historical Chart */}
      <HistoricalMultiplesChart ticker={upperTicker} />

      {/* 4. Peer Comparison Table */}
      {data.peers.length > 0 && (
        <PeerComparisonTable companyRow={data.companyRow} peers={data.peers} />
      )}

      {/* 5. Valuation by Multiple — per-multiple calculation */}
      <MultipleBreakdownCards
        multiples={data.multiples}
        sharesOutstanding={data.sharesOutstanding}
        netDebt={data.netDebt}
      />

      {/* 6. Consensus Breakdown — how median is derived from the above */}
      <ConsensusBreakdown
        multiples={data.multiples}
        consensusFairValue={data.consensusFairValue}
        currentPrice={data.currentPrice}
      />

      {/* 6. Methodology */}
      <MethodologyCard paragraphs={[
        "This relative valuation analyzes the company across five trading multiples: P/E (Price-to-Earnings), EV/EBITDA (Enterprise Value to EBITDA), P/B (Price-to-Book), P/S (Price-to-Sales), and P/FCF (Price-to-Free Cash Flow). Each multiple provides a different lens on valuation — earnings-based multiples like P/E are most common, while EV/EBITDA is capital-structure neutral, P/B anchors to asset value, P/S works for unprofitable growth companies, and P/FCF focuses on cash generation.",
        "For each multiple, the model first attempts a historical self-comparison using the company's own 5-year average. When at least 100 daily data points are available, the fair value is derived from the historical average multiple applied to the current metric. When insufficient history exists, the model falls back to the median of industry peers. The consensus fair value is the median of all individual fair values — using the median rather than the average ensures that a single outlier multiple cannot distort the result.",
        "The percentile indicator shows where the current multiple sits relative to its own 5-year history (0th = cheapest it has been, 100th = most expensive). Multiples below the historical average suggest potential undervaluation, while those above suggest premium pricing. The peer comparison provides additional context by benchmarking against companies in the same industry.",
      ]} />
    </>
  );
}
