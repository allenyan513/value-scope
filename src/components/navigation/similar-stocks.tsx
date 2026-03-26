interface Props {
  ticker: string;
}

export function SimilarStocks({ ticker }: Props) {
  return (
    <div className="hidden md:block mt-8 pt-6 border-t">
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">
        Similar Stocks to {ticker}
      </h3>
      <p className="text-xs text-muted-foreground">
        Coming soon
      </p>
    </div>
  );
}
