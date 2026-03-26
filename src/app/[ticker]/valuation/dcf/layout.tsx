import { DCFModelNav } from "@/components/valuation/dcf-model-nav";
import { getCompany } from "@/lib/db/queries";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export default async function DCFLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);
  const companyName = company?.name ?? upperTicker;

  return (
    <div className="val-page">
      <div className="flex items-center justify-between gap-4">
        <h2 className="val-h2">
          {companyName} ({upperTicker}) DCF Valuation
        </h2>
        <DCFModelNav ticker={upperTicker} />
      </div>
      {children}
    </div>
  );
}
