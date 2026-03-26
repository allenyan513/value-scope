import { ValuationSidebar } from "@/components/navigation/valuation-sidebar";
import { SimilarStocks } from "@/components/navigation/similar-stocks";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export default async function ValuationLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Left sidebar */}
      <aside className="w-full md:w-56 shrink-0">
        <ValuationSidebar ticker={upperTicker} />
        <SimilarStocks ticker={upperTicker} />
      </aside>
      {/* Main content */}
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
