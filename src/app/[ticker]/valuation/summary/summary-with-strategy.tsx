"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { SummaryCard } from "@/components/valuation/summary-card";
import { StrategySwitcher } from "./strategy-switcher";
import { computeFullValuation } from "@/lib/valuation/summary";
import { DEFAULT_CONSENSUS_STRATEGY } from "@/lib/constants";
import type { ConsensusStrategy, ValuationSummary, Company, FinancialStatement, AnalystEstimate, PeerComparison, HistoricalMultiplesPoint } from "@/types";

const VALID_STRATEGIES = new Set<ConsensusStrategy>(["dcf_primary", "median", "weighted"]);

interface Props {
  defaultSummary: ValuationSummary;
  ticker: string;
  company: Company;
  historicals: FinancialStatement[];
  estimates: AnalystEstimate[];
  peers: PeerComparison[];
  historicalMultiples: HistoricalMultiplesPoint[];
  riskFreeRate: number;
  currentPrice: number;
  peerEVEBITDAMedian?: number;
}

export function SummaryWithStrategy({
  defaultSummary,
  ticker,
  company,
  historicals,
  estimates,
  peers,
  historicalMultiples,
  riskFreeRate,
  currentPrice,
  peerEVEBITDAMedian,
}: Props) {
  const searchParams = useSearchParams();
  const strategyParam = searchParams.get("strategy");

  const strategy: ConsensusStrategy =
    strategyParam && VALID_STRATEGIES.has(strategyParam as ConsensusStrategy)
      ? (strategyParam as ConsensusStrategy)
      : DEFAULT_CONSENSUS_STRATEGY;

  // Re-compute only when strategy differs from default (pure CPU math, ~1ms)
  const summary = useMemo(() => {
    if (strategy === defaultSummary.consensus_strategy) {
      return defaultSummary;
    }
    return computeFullValuation({
      company,
      historicals,
      estimates,
      peers,
      currentPrice,
      riskFreeRate,
      historicalMultiples,
      consensusStrategy: strategy,
      peerEVEBITDAMedian,
    }) ?? defaultSummary;
  }, [strategy, defaultSummary, company, historicals, estimates, peers, currentPrice, riskFreeRate, historicalMultiples, peerEVEBITDAMedian]);

  return (
    <SummaryCard
      summary={summary}
      strategySwitcher={<StrategySwitcher current={strategy} ticker={ticker} />}
    />
  );
}
