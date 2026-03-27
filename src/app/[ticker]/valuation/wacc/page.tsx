import { Metadata } from "next";
import { getCompany } from "@/lib/db/queries";
import { getCoreTickerData } from "../../data";
import { formatLargeNumber } from "@/lib/format";
import { getSectorBetaStats } from "@/lib/data/sector-beta";
import { MethodologyCard } from "@/components/valuation/methodology-card";

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

/** Where does this WACC sit relative to sector range? */
function getSectorPosition(wacc: number, p25: number, p75: number): string {
  if (wacc < p25) return "Below sector range";
  if (wacc > p75) return "Above sector range";
  if (Math.abs(wacc - (p25 + p75) / 2) < 0.005) return "Near sector median";
  if (wacc < (p25 + p75) / 2) return "Lower half of sector range";
  return "Upper half of sector range";
}

export default async function WACCPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();
  const { company, summary } = await getCoreTickerData(upperTicker);

  if (!summary || !company) {
    return (
      <p className="text-muted-foreground py-8 text-center">
        Financial data not yet available for WACC analysis.
      </p>
    );
  }

  const w = summary.wacc;
  const isBottomUp = w.beta_method === "bottom_up";

  // Fetch sector stats for context bar
  const sectorStats = company.sector
    ? await getSectorBetaStats(company.sector).catch(() => null)
    : null;

  // Individual beta (before bottom-up) for insight card
  const individualBeta = company.beta
    ? Math.max(0.3, 0.67 * company.beta + 0.33 * 1.0)
    : null;

  // WACC component values for waterfall
  const equityComponent = w.equity_weight * w.cost_of_equity;
  const debtComponent = w.debt_weight * w.cost_of_debt * (1 - w.tax_rate);

  return (
    <div className="val-page">
      <h2 className="val-h2">{company.name} ({upperTicker}) WACC — Discount Rate Breakdown</h2>

      <div className="val-card">
        {/* ── WACC Result ── */}
        <div className="text-center">
          <div className="text-sm text-muted-foreground">Weighted Average Cost of Capital</div>
          <div className="text-4xl font-bold mt-1">{pct(w.wacc)}</div>
        </div>

        {/* ── A. Sector Context Bar ── */}
        {sectorStats?.p25_wacc != null && sectorStats?.p75_wacc != null && sectorStats?.median_wacc != null && (
          <SectorContextBar
            wacc={w.wacc}
            sector={company.sector}
            p25={sectorStats.p25_wacc}
            median={sectorStats.median_wacc}
            p75={sectorStats.p75_wacc}
            peerCount={sectorStats.peer_count}
          />
        )}

        {/* ── B. Beta Insight Card (only when bottom-up is active) ── */}
        {isBottomUp && individualBeta != null && (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm max-w-lg">
            <div className="font-medium mb-2">Beta Method: Bottom-Up Sector Beta</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Individual Beta (FMP)</span>
                <span className="line-through text-muted-foreground">{individualBeta.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bottom-Up Sector Beta</span>
                <span className="font-medium">{w.beta.toFixed(2)}</span>
              </div>
              {individualBeta !== w.beta && (
                <div className="text-xs text-muted-foreground mt-1">
                  {w.beta < individualBeta
                    ? `Bottom-up beta is ${pct((individualBeta - w.beta) / individualBeta)} lower — removes stock price noise by using the sector peer median.`
                    : `Bottom-up beta is ${pct((w.beta - individualBeta) / individualBeta)} higher — company's leverage amplifies the sector beta.`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Cost of Equity (CAPM) ── */}
        <div>
          <h3 className="val-h3">Cost of Equity (CAPM)</h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Risk-Free Rate (10Y Treasury)" value={pct(w.risk_free_rate)} />

            {isBottomUp && w.sector_unlevered_beta != null ? (
              <>
                <Row label="Sector Median Unlevered Beta" value={w.sector_unlevered_beta.toFixed(3)} />
                <Row label="Beta (β) — Bottom-Up Sector Beta" value={w.beta.toFixed(2)} />
                <div className="text-xs text-muted-foreground">
                  Re-levered with company D/E, then Bloomberg adjusted (0.67 × β + 0.33 × 1.0)
                </div>
              </>
            ) : (
              <Row label="Beta (β) — Bloomberg Adjusted" value={w.beta.toFixed(2)} />
            )}

            <Row label="Equity Risk Premium (ERP)" value={pct(w.erp)} />
            {w.additional_risk_premium > 0 && (
              <Row label="Additional Risk Premium" value={pct(w.additional_risk_premium)} />
            )}
            <div className="border-t my-2" />
            <Row label="Ke = Rf + β × ERP" value={pct(w.cost_of_equity)} highlight />
            <div className="text-xs text-muted-foreground mt-1">
              = {pct(w.risk_free_rate)} + {w.beta.toFixed(2)} × {pct(w.erp)}
              {w.additional_risk_premium > 0 ? ` + ${pct(w.additional_risk_premium)}` : ""}
            </div>
          </div>
        </div>

        {/* ── Cost of Debt ── */}
        <div>
          <h3 className="val-h3">Cost of Debt</h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Pre-tax Cost of Debt (Kd)" value={pct(w.cost_of_debt)} />
            <Row label="Tax Rate" value={pct(w.tax_rate)} />
            <div className="border-t my-2" />
            <Row label="After-tax Kd = Kd × (1 − t)" value={pct(w.cost_of_debt * (1 - w.tax_rate))} highlight />
          </div>
        </div>

        {/* ── Capital Structure ── */}
        <div>
          <h3 className="val-h3">Capital Structure</h3>
          <div className="space-y-1.5 text-sm max-w-lg">
            <Row label="Equity (Market Cap)" value={formatLargeNumber(w.total_equity, { prefix: "$", decimals: 1 })} />
            <Row label="Debt" value={formatLargeNumber(w.total_debt, { prefix: "$", decimals: 1 })} />
            <div className="border-t my-2" />
            <Row label="Equity Weight (E / V)" value={pct(w.equity_weight)} highlight />
            <Row label="Debt Weight (D / V)" value={pct(w.debt_weight)} highlight />
          </div>

          {/* Visual bar */}
          <div className="flex rounded-full overflow-hidden h-3 mt-3 max-w-lg">
            <div className="bg-primary" style={{ width: `${w.equity_weight * 100}%` }} title={`Equity: ${pct(w.equity_weight)}`} />
            <div className="bg-muted-foreground/30" style={{ width: `${w.debt_weight * 100}%` }} title={`Debt: ${pct(w.debt_weight)}`} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-lg">
            <span>Equity {pct(w.equity_weight)}</span>
            <span>Debt {pct(w.debt_weight)}</span>
          </div>
        </div>

        {/* ── C. WACC Waterfall ── */}
        <div>
          <h3 className="val-h3">WACC Composition</h3>
          <WACCWaterfall
            equityComponent={equityComponent}
            debtComponent={debtComponent}
            wacc={w.wacc}
            equityWeight={w.equity_weight}
            debtWeight={w.debt_weight}
            costOfEquity={w.cost_of_equity}
            costOfDebt={w.cost_of_debt}
            taxRate={w.tax_rate}
          />
        </div>
      </div>

      {/* ── D. Simplified Methodology ── */}
      <MethodologyCard paragraphs={[
        "WACC is the discount rate used in all DCF models on this platform. It blends the cost of equity (CAPM) and after-tax cost of debt, weighted by market-cap-based capital structure.",
        "Beta is derived using the bottom-up (sector) approach: peer betas are unlevered, the sector median is taken, then re-levered with the target company's own D/E ratio. This produces more stable betas than individual stock regression. Bloomberg adjustment (0.67 × β + 0.33 × 1.0) accounts for mean reversion.",
      ]} />
    </div>
  );
}

/* ── Sub-components ── */

function SectorContextBar({
  wacc, sector, p25, median, p75, peerCount,
}: {
  wacc: number; sector: string; p25: number; median: number; p75: number; peerCount: number;
}) {
  // Position of WACC within p25–p75 range as percentage (clamped 0–100)
  const range = p75 - p25;
  const positionPct = range > 0
    ? Math.max(0, Math.min(100, ((wacc - p25) / range) * 100))
    : 50;

  const label = getSectorPosition(wacc, p25, p75);

  return (
    <div className="rounded-lg bg-muted/30 border border-border/50 p-4 max-w-lg">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{sector} Sector IQR ({peerCount} peers)</span>
        <span>{label}</span>
      </div>

      {/* Range bar */}
      <div className="relative h-2 rounded-full bg-muted mt-2 mb-1">
        {/* IQR fill */}
        <div className="absolute h-full rounded-full bg-primary/30" style={{ left: "0%", width: "100%" }} />
        {/* Median tick */}
        <div
          className="absolute top-0 w-0.5 h-full bg-muted-foreground/50"
          style={{ left: `${range > 0 ? ((median - p25) / range) * 100 : 50}%` }}
        />
        {/* Company WACC marker */}
        <div
          className="absolute -top-1 w-4 h-4 rounded-full bg-primary border-2 border-background"
          style={{ left: `calc(${positionPct}% - 8px)` }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>P25: {pct(p25)}</span>
        <span>Median: {pct(median)}</span>
        <span>P75: {pct(p75)}</span>
      </div>
    </div>
  );
}

function WACCWaterfall({
  equityComponent, debtComponent, wacc,
  equityWeight, debtWeight, costOfEquity, costOfDebt, taxRate,
}: {
  equityComponent: number; debtComponent: number; wacc: number;
  equityWeight: number; debtWeight: number; costOfEquity: number; costOfDebt: number; taxRate: number;
}) {
  const total = equityComponent + debtComponent;
  const equityPct = total > 0 ? (equityComponent / total) * 100 : 100;
  const debtPct = total > 0 ? (debtComponent / total) * 100 : 0;

  return (
    <div className="max-w-lg space-y-2">
      {/* Stacked bar */}
      <div className="flex rounded-lg overflow-hidden h-8">
        <div
          className="bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground"
          style={{ width: `${Math.max(equityPct, 8)}%` }}
        >
          {pct(equityComponent)}
        </div>
        {debtPct > 2 && (
          <div
            className="bg-primary/40 flex items-center justify-center text-xs font-medium"
            style={{ width: `${Math.max(debtPct, 8)}%` }}
          >
            {pct(debtComponent)}
          </div>
        )}
      </div>

      {/* Labels */}
      <div className="flex text-xs text-muted-foreground gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
          Equity: {pct(equityWeight)} × {pct(costOfEquity)}
        </div>
        {debtComponent > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/40 inline-block" />
            Debt: {pct(debtWeight)} × {pct(costOfDebt)} × (1−{pct(taxRate)})
          </div>
        )}
      </div>

      {/* Total */}
      <div className="flex justify-between text-sm font-medium pt-1 border-t">
        <span>WACC</span>
        <span className="text-primary">{pct(wacc)}</span>
      </div>
    </div>
  );
}

function Row({
  label, value, highlight, primary,
}: {
  label: string; value: string; highlight?: boolean; primary?: boolean;
}) {
  return (
    <div className={`val-row ${highlight ? "val-row-highlight" : ""} ${primary ? "val-row-primary" : ""}`}>
      <span className="val-row-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}
