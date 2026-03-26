"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Valuation", segment: "valuation" },
  { label: "Financials", segment: "financials" },
  { label: "Forecast", segment: "forecast" },
  { label: "Compare", segment: "compare" },
  { label: "Historical Price", segment: "historical-price" },
  { label: "Solvency", segment: "solvency" },
  { label: "Dividends", segment: "dividends" },
  { label: "Transactions", segment: "transactions" },
  { label: "People", segment: "people" },
];

interface Props {
  ticker: string;
}

export function PrimaryNav({ ticker }: Props) {
  const segment = useSelectedLayoutSegment();
  const basePath = `/${ticker}`;

  return (
    <nav className="border-b mb-8">
      <div className="flex gap-0 -mb-px overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = segment === item.segment;

          return (
            <Link
              key={item.segment}
              href={`${basePath}/${item.segment}`}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
