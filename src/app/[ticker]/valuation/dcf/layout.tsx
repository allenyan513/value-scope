import { DCFModelNav } from "@/components/valuation/dcf-model-nav";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export default async function DCFLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-xl font-bold">
          Discounted Cash Flow (DCF) Valuation
        </h2>
        <DCFModelNav ticker={upperTicker} />
      </div>
      {children}
    </>
  );
}
