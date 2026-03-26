"use client";

import { useRouter } from "next/navigation";
import type { ConsensusStrategy } from "@/types";

const STRATEGIES: { value: ConsensusStrategy; label: string; description: string }[] = [
  { value: "dcf_primary", label: "DCF Primary", description: "DCF Perpetual Growth as fair value" },
  { value: "median", label: "Median Consensus", description: "Median of 3 pillars (DCF / Multiples / PEG)" },
  { value: "weighted", label: "Weighted Consensus", description: "Archetype-based weighted average" },
];

interface Props {
  current: ConsensusStrategy;
  ticker: string;
}

export function StrategySwitcher({ current, ticker }: Props) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const strategy = e.target.value;
    const url = `/${ticker}/valuation/summary${strategy === "dcf_primary" ? "" : `?strategy=${strategy}`}`;
    router.push(url);
  }

  return (
    <select
      id="strategy-select"
      value={current}
      onChange={handleChange}
      className="bg-muted/50 border border-muted rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/50"
    >
      {STRATEGIES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}
