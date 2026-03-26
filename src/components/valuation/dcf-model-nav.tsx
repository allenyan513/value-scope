"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const DCF_MODELS = [
  { slug: "perpetual-growth", label: "Perpetual Growth (10Y)" },
  { slug: "pe-exit", label: "P/E Exit (10Y)" },
  { slug: "ev-ebitda-exit", label: "EV/EBITDA Exit (10Y)" },
];

interface Props {
  ticker: string;
}

export function DCFModelNav({ ticker }: Props) {
  const pathname = usePathname();
  const basePath = `/${ticker}/valuation/dcf`;

  return (
    <nav className="flex gap-1 rounded-lg border bg-card p-1">
      {DCF_MODELS.map((m) => {
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
