// ============================================================
// FCFF DCF — re-export barrel (backward compatibility)
// Import directly from the sub-modules for better tree-shaking:
//   dcf-fcff-builders.ts  — shared builder helpers
//   dcf-fcff-growth.ts    — Gordon Growth 5Y / 10Y
//   dcf-fcff-ebitda-exit.ts — EBITDA Exit 5Y
// ============================================================

export type { DCFFCFFInputs } from "./dcf-fcff-builders";
export { calculateDCFFCFF, calculateDCFFCFF10Y } from "./dcf-fcff-growth";
export type { DCFFCFFEBITDAExitInputs } from "./dcf-fcff-ebitda-exit";
export { calculateDCFFCFFEBITDAExit } from "./dcf-fcff-ebitda-exit";
