"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SIDEBAR_ITEMS = [
  { label: "Valuation Summary", href: "/summary" },
  { label: "Discounted Cash Flow", href: "/dcf/perpetual-growth", activePrefix: "/dcf" },
  { label: "Trading Multiples", href: "/relative/pe-multiples", activePrefix: "/relative" },
  { label: "Peter Lynch Fair Value", href: "/peter-lynch" },
  { label: "Analyst Estimates", href: "/analyst-estimates" },
  { label: "Dividend Discount Model", href: "/ddm", badge: "Soon" },
  { label: "WACC", href: "/wacc" },
];

interface Props {
  ticker: string;
}

export function ValuationSidebar({ ticker }: Props) {
  const pathname = usePathname();
  const basePath = `/${ticker}/valuation`;

  return (
    <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0">
      {SIDEBAR_ITEMS.map((item) => {
        const fullHref = `${basePath}${item.href}`;
        const matchPath = `${basePath}${item.activePrefix ?? item.href}`;
        const isActive = pathname === matchPath || pathname.startsWith(matchPath + "/");

        return (
          <Link
            key={item.href}
            href={fullHref}
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
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
