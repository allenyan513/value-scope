"use client";

import { HistoricalMultipleCard } from "@/components/valuation/historical-multiple-card";
import type {
  HistoricalMultiplesPoint,
  HistoricalRelativeValuation,
} from "@/types";

interface Props {
  valuations: HistoricalRelativeValuation[];
  history: HistoricalMultiplesPoint[];
  currentPrice: number;
}

export function RelativeValuationCards({
  valuations,
  history,
  currentPrice,
}: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {valuations.map((v) => (
        <HistoricalMultipleCard
          key={v.type}
          valuation={v}
          history={history}
          currentPrice={currentPrice}
        />
      ))}
    </div>
  );
}
