"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

const SIDEBAR_ITEMS = [
  { label: "Valuation Summary", href: "/summary", segment: "summary" },
  { label: "Discounted Cash Flow", href: "/dcf/perpetual-growth", segment: "dcf" },
  { label: "Trading Multiples", href: "/relative/pe-multiples", segment: "relative" },
  { label: "Peter Lynch Fair Value", href: "/peter-lynch", segment: "peter-lynch" },
  { label: "Analyst Estimates", href: "/analyst-estimates", segment: "analyst-estimates" },
  { label: "Dividend Discount Model", href: "/ddm", segment: "ddm", badge: "Soon" },
  { label: "WACC", href: "/wacc", segment: "wacc" },
];

interface Props {
  ticker: string;
}

export function ValuationSidebar({ ticker }: Props) {
  const activeSegment = useSelectedLayoutSegment();
  const basePath = `/${ticker}/valuation`;

  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
      {SIDEBAR_ITEMS.map((item) => {
        const fullHref = `${basePath}${item.href}`;
        const isActive = activeSegment === item.segment;

        return (
          <Link
            key={item.href}
            href={fullHref}
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
              isActive
                ? "bg-primary/10 text-primary border-l-2 md:border-l-3 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <span>{item.label}</span>
            {item.badge && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
