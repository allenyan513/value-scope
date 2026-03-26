import { TradingMultiplesNav } from "./nav";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export default async function RelativeLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-bold">Trading Multiples</h2>
        <TradingMultiplesNav ticker={upperTicker} />
      </div>
      {children}
    </>
  );
}
