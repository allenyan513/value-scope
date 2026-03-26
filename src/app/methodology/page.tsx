import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology — How We Value Stocks",
  description:
    "Learn how ValuScope calculates intrinsic value using 7 valuation models: DCF, P/E, EV/EBITDA, and PEG. Fully transparent assumptions.",
};

export default function MethodologyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-bold mb-4">Valuation Methodology</h1>
      <p className="text-lg text-muted-foreground mb-12">
        ValuScope uses 7 valuation models to estimate intrinsic value. Every
        assumption is visible and inspectable. Here&apos;s how each model works.
      </p>

      {/* WACC */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">
          Cost of Capital (WACC)
        </h2>
        <p className="text-muted-foreground mb-4">
          All DCF models discount future cash flows using the Weighted Average
          Cost of Capital (WACC). Our calculation:
        </p>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Cost of Equity</strong> = Risk-Free Rate + Beta &times;
            Equity Risk Premium (5.5%)
          </div>
          <div>
            <strong>Risk-Free Rate</strong> = 10-Year US Treasury yield (live
            from FRED)
          </div>
          <div>
            <strong>Cost of Debt</strong> = Interest Expense &divide; Total Debt
            (capped at 15%)
          </div>
          <div>
            <strong>WACC</strong> = Cost of Equity &times; Equity Weight + Cost
            of Debt &times; (1 - Tax Rate) &times; Debt Weight
          </div>
          <div className="text-muted-foreground pt-2 border-t">
            WACC is floored at 5% and capped at 25%. Beta sourced from FMP
            (market beta).
          </div>
        </div>
      </section>

      {/* DCF Growth Exit */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">
          1&ndash;2. DCF Growth Exit (5Y &amp; 10Y)
        </h2>
        <p className="text-muted-foreground mb-4">
          Projects free cash flow for 5 or 10 years, then calculates a terminal
          value using the Gordon Growth Model.
        </p>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Revenue Growth</strong>: Analyst consensus estimates (when
            available), fading to 3% long-term GDP growth
          </div>
          <div>
            <strong>Margins</strong>: 5-year historical averages for COGS, SG&amp;A,
            R&amp;D, CapEx, D&amp;A
          </div>
          <div>
            <strong>Free Cash Flow</strong> = NOPAT + D&amp;A - CapEx - &Delta;NWC
          </div>
          <div>
            <strong>Terminal Value</strong> = FCF<sub>n</sub> &times; (1 + g)
            &divide; (WACC - g), where g = 3% terminal growth
          </div>
          <div>
            <strong>Fair Value</strong> = (PV of FCFs + PV of Terminal Value -
            Net Debt) &divide; Shares Outstanding
          </div>
          <div className="text-muted-foreground pt-2 border-t">
            Sensitivity analysis varies WACC (&plusmn;2%) and terminal growth
            rate (1%&ndash;5%).
          </div>
        </div>
      </section>

      {/* DCF EBITDA Exit */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">
          3&ndash;4. DCF EBITDA Exit (5Y &amp; 10Y)
        </h2>
        <p className="text-muted-foreground mb-4">
          Same FCF projection as above, but uses an EV/EBITDA exit multiple for
          the terminal value instead of perpetuity growth.
        </p>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Terminal Value</strong> = EBITDA<sub>n</sub> &times; Exit
            Multiple
          </div>
          <div>
            <strong>Exit Multiple</strong>: Industry median EV/EBITDA from peer
            companies (default 12x if insufficient peers)
          </div>
          <div className="text-muted-foreground pt-2 border-t">
            Sensitivity analysis varies WACC (&plusmn;2%) and exit multiple
            (8x&ndash;16x).
          </div>
        </div>
      </section>

      {/* P/E Multiples */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">5. P/E Multiples</h2>
        <p className="text-muted-foreground mb-4">
          A relative valuation comparing the company to industry peers using
          Price-to-Earnings ratios.
        </p>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Fair Value</strong> = Blended Industry Median P/E &times;
            Company TTM EPS
          </div>
          <div>
            <strong>Blended P/E</strong> = Average of trailing and forward
            median P/E (when forward estimates available)
          </div>
          <div>
            <strong>Range</strong>: 25th&ndash;75th percentile of peer P/E
            ratios &times; EPS
          </div>
          <div className="text-muted-foreground pt-2 border-t">
            Peers filtered to same industry, valid P/E between 0 and 200.
          </div>
        </div>
      </section>

      {/* EV/EBITDA Multiples */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">6. EV/EBITDA Multiples</h2>
        <p className="text-muted-foreground mb-4">
          Enterprise value-based relative valuation, less affected by capital
          structure differences than P/E.
        </p>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Fair Value</strong> = (Industry Median EV/EBITDA &times;
            Company EBITDA - Net Debt) &divide; Shares Outstanding
          </div>
          <div>
            <strong>Range</strong>: 25th&ndash;75th percentile of peer EV/EBITDA
          </div>
          <div className="text-muted-foreground pt-2 border-t">
            Peers filtered to same industry, valid EV/EBITDA between 0 and 100.
          </div>
        </div>
      </section>

      {/* PEG Fair Value */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">7. PEG Fair Value</h2>
        <p className="text-muted-foreground mb-4">
          A fairly priced stock has a P/E ratio equal to its earnings growth rate (PEG = 1.0).
          Includes dividend yield for the full PEGY variant.
        </p>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Fair Value</strong> = (EPS Growth Rate + Dividend Yield) &times; 100 &times; NTM EPS
          </div>
          <div>
            <strong>Growth Rate</strong>: Forward analyst consensus EPS CAGR (fallback: historical EPS CAGR), clamped to
            8%&ndash;25%
          </div>
          <div>
            <strong>Example</strong>: 12.7% adjusted growth &times; $8.48 NTM EPS = $108 fair
            value
          </div>
          <div className="text-muted-foreground pt-2 border-t">
            Returns N/A for companies with negative EPS or insufficient
            history.
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Data Sources</h2>
        <div className="rounded-lg border p-6 space-y-3 text-sm">
          <div>
            <strong>Financial Statements</strong>: 5&ndash;7 years of annual
            data from SEC filings via Financial Modeling Prep
          </div>
          <div>
            <strong>Analyst Estimates</strong>: Forward revenue and EPS
            consensus from Financial Modeling Prep
          </div>
          <div>
            <strong>Risk-Free Rate</strong>: 10-Year US Treasury yield from
            FRED (Federal Reserve Economic Data)
          </div>
          <div>
            <strong>Stock Prices</strong>: Daily close prices updated every
            trading day
          </div>
          <div>
            <strong>Update Frequency</strong>: All data refreshed daily at 10:30
            PM ET (weekdays)
          </div>
        </div>
      </section>

      {/* Limitations */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Limitations</h2>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>
            All models rely on historical data and analyst estimates which may
            not predict future performance
          </li>
          <li>
            DCF models are highly sensitive to WACC and terminal value
            assumptions
          </li>
          <li>
            Relative valuation depends on peer selection and may not capture
            company-specific factors
          </li>
          <li>
            Financial companies (banks, insurance) may require specialized
            models not yet implemented
          </li>
          <li>
            Beta is sourced from FMP without Blume adjustment; actual cost of
            equity may differ
          </li>
        </ul>
      </section>

      <div className="text-xs text-muted-foreground border-t pt-6">
        <p>
          ValuScope is for informational purposes only and does not constitute
          financial advice. Always do your own research before making investment
          decisions.
        </p>
      </div>
    </div>
  );
}
