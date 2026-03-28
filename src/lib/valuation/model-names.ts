// Canonical model display names — single source of truth.
// Components may use a subset; import and pick what you need.

export const MODEL_NAMES: Record<string, string> = {
  // DCF FCFF models
  dcf_fcff_growth_5y: "Growth Exit 5Y",
  dcf_fcff_growth_10y: "Growth Exit 10Y",
  dcf_fcff_ebitda_exit_5y: "EBITDA Exit 5Y",
  dcf_fcff_ebitda_exit_10y: "EBITDA Exit 10Y",
  // DCF legacy keys (kept for backward compat with stored valuations)
  dcf_growth_exit_5y: "DCF Valuation",
  dcf_growth_exit_10y: "DCF — Growth Exit (10Y)",
  dcf_ebitda_exit_5y: "DCF — EBITDA Exit (5Y)",
  dcf_ebitda_exit_10y: "DCF — EBITDA Exit (10Y)",
  dcf_3stage: "DCF Perpetual Growth",
  dcf_pe_exit_10y: "P/E Exit 10Y",
  dcf_ebitda_exit_fcfe_10y: "EV/EBITDA Exit 10Y",
  // Trading multiples
  pe_multiples: "P/E",
  ev_ebitda_multiples: "EV/EBITDA",
  // PEG
  peg: "PEG Fair Value",
  // EPV
  epv: "Earnings Power Value",
};

/** Display order for models in summary view */
export const MODEL_ORDER = [
  "dcf_fcff_growth_5y",
  "dcf_fcff_growth_10y",
  "dcf_fcff_ebitda_exit_5y",
  "dcf_fcff_ebitda_exit_10y",
  "pe_multiples",
  "ev_ebitda_multiples",
  "peg",
  "epv",
];

/** Model type → detail page link */
export const MODEL_LINKS: Record<string, string> = {
  dcf_fcff_growth_5y: "/valuation/dcf/fcff-growth-5y",
  dcf_fcff_growth_10y: "/valuation/dcf/fcff-growth-10y",
  dcf_fcff_ebitda_exit_5y: "/valuation/dcf/fcff-ebitda-exit-5y",
  dcf_fcff_ebitda_exit_10y: "/valuation/dcf/fcff-ebitda-exit-10y",
  dcf_pe_exit_10y: "/valuation/dcf/pe-exit",
  dcf_ebitda_exit_fcfe_10y: "/valuation/dcf/ev-ebitda-exit",
  // Legacy keys
  dcf_growth_exit_5y: "/valuation/dcf",
  dcf_growth_exit_10y: "/valuation/dcf",
  dcf_ebitda_exit_5y: "/valuation/dcf",
  dcf_ebitda_exit_10y: "/valuation/dcf",
  dcf_3stage: "/valuation/dcf",
  pe_multiples: "/valuation/trading-multiples",
  ev_ebitda_multiples: "/valuation/trading-multiples",
  peg: "/valuation/peg",
  epv: "/valuation/epv",
};
