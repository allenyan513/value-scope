"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Valuation", href: "/valuation" },
  { label: "Financials", href: "/financials" },
  { label: "Forecast", href: "/forecast" },
  { label: "Compare", href: "/compare" },
  { label: "Historical Price", href: "/historical-price" },
  { label: "Solvency", href: "/solvency" },
  { label: "Dividends", href: "/dividends" },
  { label: "Transactions", href: "/transactions" },
  { label: "People", href: "/people" },
];

interface Props {
  ticker: string;
}

export function PrimaryNav({ ticker }: Props) {
  const pathname = usePathname();
  const basePath = `/${ticker}`;

  return (
    <nav className="border-b mb-8">
      <div className="flex gap-0 -mb-px overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const fullHref = `${basePath}${item.href}`;
          const isActive = pathname.startsWith(fullHref);

          return (
            <Link
              key={item.href}
              href={fullHref}
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
