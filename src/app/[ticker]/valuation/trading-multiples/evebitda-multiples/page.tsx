import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getRelativeValuationData } from "../data";
import { ValuationHero } from "@/components/valuation/valuation-hero";
import { PeerValuationTable } from "../peer-valuation-table";
import { MethodologyCard } from "@/components/valuation/methodology-card";
import { formatCurrency } from "@/lib/format";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} EV/EBITDA Multiples — Relative Valuation${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} EV/EBITDA multiples valuation using industry peer comparison with trailing and forward EV/EBITDA ratios.`,
  };
}

export default async function EVEBITDAMultiplesPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const data = await getRelativeValuationData(upperTicker);

  if (!data) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Data not yet available for EV/EBITDA multiples analysis.
      </p>
    );
  }

  const detail = data.multiples.find((m) => m.key === "ev_ebitda");
  if (!detail || detail.fairValue === null) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        EV/EBITDA multiples not applicable — company has negative or zero EBITDA.
      </p>
    );
  }

  return (
    <>
      <ValuationHero
        fairValue={detail.fairValue}
        currentPrice={data.currentPrice}
        upside={detail.upside ?? 0}
        narrative={
          <>
            Using the industry peer median EV/EBITDA multiple (trailing + forward),{" "}
            {data.companyName} ({data.ticker}) has a fair value of{" "}
            {formatCurrency(detail.fairValue)} based on {detail.peerCount} comparable
            companies in the {data.industry} industry.
          </>
        }
      />

      <PeerValuationTable
        companyRow={data.companyRow}
        peers={data.peers}
        multipleKey="ev_ebitda"
        detail={detail}
        industry={data.industry}
      />

      <MethodologyCard paragraphs={[
        "This EV/EBITDA relative valuation uses the industry peer median Enterprise Value to EBITDA ratio to estimate fair value. Both trailing (last 12 months) and forward (next fiscal year analyst estimates) EV/EBITDA multiples are computed independently.",
        "The industry median EV/EBITDA is applied to the company's EBITDA to produce an enterprise value. Net debt (total debt minus cash) is subtracted to arrive at equity value, which is divided by shares outstanding for fair price per share. The selected fair value is the average of the trailing and forward legs.",
      ]} />
    </>
  );
}
