import Link from "next/link";

export default function TickerNotFound() {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold mb-4">Stock Not Found</h1>
      <p className="text-muted-foreground mb-6">
        We don&apos;t have valuation data for this ticker yet. We currently cover
        S&amp;P 500 companies.
      </p>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Search Another Stock
      </Link>
    </div>
  );
}
