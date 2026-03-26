// Financial Modeling Prep (FMP) API Client — Stable API
// Re-exported from domain-specific modules

export { searchTickers, getCompanyProfile, getIncomeStatements, getBalanceSheets, getCashFlowStatements, getSP500Constituents, getIndustryPeers } from "./fmp-financials";
export { getHistoricalPrices, getQuote, getBatchQuotes } from "./fmp-prices";
export { getAnalystEstimates, getPriceTargetConsensus, getEarningsSurprises, getAnalystRecommendations, getUpgradesDowngrades, getEarningsCalendar } from "./fmp-estimates";
export type { FMPUpgradeDowngrade } from "./fmp-estimates";
export { getKeyMetrics, getEVMetrics } from "./fmp-multiples";
export type { FMPEVMetrics } from "./fmp-multiples";
export { getFXRateToUSD } from "./fmp-fx";
