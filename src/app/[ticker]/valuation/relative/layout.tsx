import { TradingMultiplesNav } from "./nav";
import { getCompany } from "@/lib/db/queries";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export default async function RelativeLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);
  const companyName = company?.name ?? upperTicker;

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-bold">
          {companyName} ({upperTicker}) Trading Multiples
        </h2>
        <TradingMultiplesNav ticker={upperTicker} />
      </div>
      {children}
    </>
  );
}
