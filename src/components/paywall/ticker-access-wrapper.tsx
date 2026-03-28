"use client";

import { AccessGate } from "./access-gate";

interface Props {
  ticker: string;
  children: React.ReactNode;
}

/**
 * Thin client wrapper used by [ticker]/layout.tsx to gate all child pages.
 * This is a separate file because layout.tsx is a server component
 * and can't use hooks directly.
 */
export function TickerAccessWrapper({ ticker, children }: Props) {
  return <AccessGate ticker={ticker}>{children}</AccessGate>;
}
