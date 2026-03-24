"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ValuationResult } from "@/types";

const SLUG_MAP: Record<string, { slug: string; label: string; desc: string }> = {
  dcf_3stage: {
    slug: "perpetual-growth",
    label: "Perpetual Growth",
    desc: "Gordon Growth terminal value",
  },
  dcf_pe_exit_10y: {
    slug: "pe-exit",
    label: "P/E Exit",
    desc: "P/E multiple terminal value",
  },
  dcf_ebitda_exit_fcfe_10y: {
    slug: "ev-ebitda-exit",
    label: "EV/EBITDA Exit",
    desc: "EV/EBITDA multiple terminal value",
  },
};

function getUpsideColor(upside: number) {
  if (upside > 15) return "text-green-600 dark:text-green-400";
  if (upside < -15) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

interface Props {
  ticker: string;
  models: ValuationResult[];
  currentPrice: number;
}

export function DCFModelNav({ ticker, models, currentPrice }: Props) {
  const pathname = usePathname();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
      {models.map((model) => {
        const config = SLUG_MAP[model.model_type];
        if (!config) return null;

        const href = `/${ticker}/dcf-valuation/${config.slug}`;
        const isActive = pathname === href.toLowerCase() || pathname === href;
        const upside = model.upside_percent;

        return (
          <Link
            key={model.model_type}
            href={href}
            className={cn(
              "block rounded-xl border-2 p-4 transition-all hover:shadow-md",
              isActive
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border/60 bg-card hover:border-border"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm">{config.label}</span>
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                10Y
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {config.desc}
            </p>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono">
                ${model.fair_value.toFixed(2)}
              </span>
              <span className={cn("text-sm font-semibold font-mono", getUpsideColor(upside))}>
                {upside > 0 ? "+" : ""}{upside.toFixed(1)}%
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
