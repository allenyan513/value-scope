import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../../data";
import { formatLargeNumber } from "@/lib/format";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const revalidate = 3600; // ISR: 1 hour (must be literal for Next.js)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const company = await getCompany(upperTicker);

  return {
    title: `${upperTicker} WACC — Discount Rate Breakdown${company ? ` | ${company.name}` : ""} | ValuScope`,
    description: `${company?.name ?? upperTicker} Weighted Average Cost of Capital (WACC) breakdown including cost of equity (CAPM), cost of debt, and capital structure weights.`,
  };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

export default async function WACCPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { summary } = await getCoreTickerData(upperTicker);

  if (!summary) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for WACC analysis.
      </p>
    );
  }

  const w = summary.wacc;

  return (
    <>
      <h2 className="text-xl font-bold mb-6">WACC — Discount Rate Breakdown</h2>

      <div className="rounded-lg border bg-card p-6 space-y-8">
        {/* WACC Result */}
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Weighted Average Cost of Capital</div>
          <div className="text-4xl font-bold mt-1">{pct(w.wacc)}</div>
        </div>

        {/* Formula */}
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-center">
          WACC = E/(D+E) × Ke + D/(D+E) × Kd × (1 − t)
        </div>

        {/* Cost of Equity (CAPM) */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Cost of Equity (CAPM)
          </h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Risk-Free Rate (10Y Treasury)" value={pct(w.risk_free_rate)} />
            <Row label="Beta (β)" value={w.beta.toFixed(2)} />
            <Row label="Equity Risk Premium (ERP)" value={pct(w.erp)} />
            {w.additional_risk_premium > 0 && (
              <Row label="Additional Risk Premium" value={pct(w.additional_risk_premium)} />
            )}
            <div className="border-t my-2" />
            <Row
              label="Ke = Rf + β × ERP"
              value={pct(w.cost_of_equity)}
              highlight
            />
            <div className="text-xs text-muted-foreground mt-1">
              = {pct(w.risk_free_rate)} + {w.beta.toFixed(2)} × {pct(w.erp)}
              {w.additional_risk_premium > 0 ? ` + ${pct(w.additional_risk_premium)}` : ""}
            </div>
          </div>
        </div>

        {/* Cost of Debt */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Cost of Debt
          </h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Pre-tax Cost of Debt (Kd)" value={pct(w.cost_of_debt)} />
            <Row label="Tax Rate" value={pct(w.tax_rate)} />
            <div className="border-t my-2" />
            <Row
              label="After-tax Kd = Kd × (1 − t)"
              value={pct(w.cost_of_debt * (1 - w.tax_rate))}
              highlight
            />
          </div>
        </div>

        {/* Capital Structure */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Capital Structure
          </h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row
              label="Equity (Market Cap)"
              value={formatLargeNumber(w.total_equity, { prefix: "$", decimals: 1 })}
            />
            <Row
              label="Debt"
              value={formatLargeNumber(w.total_debt, { prefix: "$", decimals: 1 })}
            />
            <div className="border-t my-2" />
            <Row label="Equity Weight (E / V)" value={pct(w.equity_weight)} highlight />
            <Row label="Debt Weight (D / V)" value={pct(w.debt_weight)} highlight />
          </div>

          {/* Visual bar */}
          <div className="flex rounded-full overflow-hidden h-3 mt-3 max-w-lg">
            <div
              className="bg-primary"
              style={{ width: `${w.equity_weight * 100}%` }}
              title={`Equity: ${pct(w.equity_weight)}`}
            />
            <div
              className="bg-muted-foreground/30"
              style={{ width: `${w.debt_weight * 100}%` }}
              title={`Debt: ${pct(w.debt_weight)}`}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-lg">
            <span>Equity {pct(w.equity_weight)}</span>
            <span>Debt {pct(w.debt_weight)}</span>
          </div>
        </div>

        {/* Final WACC Calculation */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            WACC Calculation
          </h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row
              label={`Equity component: ${pct(w.equity_weight)} × ${pct(w.cost_of_equity)}`}
              value={pct(w.equity_weight * w.cost_of_equity)}
            />
            <Row
              label={`Debt component: ${pct(w.debt_weight)} × ${pct(w.cost_of_debt)} × (1 − ${pct(w.tax_rate)})`}
              value={pct(w.debt_weight * w.cost_of_debt * (1 - w.tax_rate))}
            />
            <div className="border-t my-2" />
            <Row label="WACC" value={pct(w.wacc)} highlight primary />
          </div>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  highlight,
  primary,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  primary?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-0.5 ${highlight ? "font-semibold" : ""} ${primary ? "text-primary" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
