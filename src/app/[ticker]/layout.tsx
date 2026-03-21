import { Badge } from "@/components/ui/badge";
import { AddToWatchlistButton } from "@/components/watchlist/add-to-watchlist-button";
import { SubPageNav } from "@/components/valuation/sub-page-nav";
import { getTickerData } from "./data";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

function formatMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default async function TickerLayout({ params, children }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { company, summary } = await getTickerData(upperTicker);

  const currentPrice = summary?.current_price ?? company.price ?? 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Company Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold">{company.name}</h1>
            <Badge variant="outline" className="font-mono text-base">
              {upperTicker}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{company.sector}</span>
            <span>{company.industry}</span>
            <span>{company.exchange}</span>
            <AddToWatchlistButton ticker={upperTicker} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold">
            ${currentPrice.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground">
            Market Cap: {formatMarketCap(company.market_cap)}
          </div>
        </div>
      </div>

      {/* Sub-page Navigation */}
      <SubPageNav ticker={upperTicker} />

      {/* Page Content */}
      {children}
    </div>
  );
}
