"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const MODELS = [
  { slug: "pe-multiples", label: "P/E Multiples" },
  { slug: "ev-ebitda-multiples", label: "EV/EBITDA Multiples" },
];

interface Props {
  ticker: string;
}

export function TradingMultiplesNav({ ticker }: Props) {
  const pathname = usePathname();
  const basePath = `/${ticker}/valuation/relative`;

  return (
    <nav className="flex gap-1 rounded-lg border bg-card p-1">
      {MODELS.map((m) => {
        const href = `${basePath}/${m.slug}`;
        const isActive = pathname === href;
        return (
          <Link
            key={m.slug}
            href={href}
            prefetch={true}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
