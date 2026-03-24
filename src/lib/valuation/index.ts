export { calculateWACC, buildWACCInputs } from "./wacc";
export { calculateDCF } from "./dcf";
export { calculateDCF3Stage, calculateDCF3StagePEExit, calculateDCF3StageEBITDAExit } from "./dcf-3stage";
// @deprecated legacy exports — kept for potential future use
export { calculateDCFGrowthExit, calculateDCFEBITDAExit } from "./dcf-legacy";
export { calculatePEMultiples, calculateEVEBITDAMultiples } from "./trading-multiples";
export { calculatePeterLynch } from "./peter-lynch";
export { computeFullValuation } from "./summary";
export { classifyCompany, computeWeightedConsensus } from "./company-classifier";
export { computeHistoricalMultiples, computeMultiplesStats } from "./historical-multiples";
