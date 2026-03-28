import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ValuationHero } from "./valuation-hero";
import { formatCurrency } from "@/lib/format";
import { MODEL_NAMES, MODEL_ORDER, MODEL_LINKS } from "@/lib/valuation/model-names";
import type { ValuationSummary, ValuationResult } from "@/types";

const VERDICT_CONFIG = {
  undervalued: { label: "Undervalued", color: "text-success" },
  fairly_valued: { label: "Fairly Valued", color: "text-muted-foreground" },
  overvalued: { label: "Overvalued", color: "text-danger" },
};

interface Props {
  summary: ValuationSummary;
}

// --- Pillar group config ---
const PILLAR_CONFIG = [
  {
    key: "dcf" as const,
    label: "Discounted Cash Flow",
    link: "/valuation/dcf/fcff-growth-5y",
  },
  {
    key: "tradingMultiples" as const,
    label: "Trading Multiples",
    link: "/valuation/trading-multiples",
  },
  {
    key: "peg" as const,
    label: "PEG",
    link: "/valuation/peg",
  },
  {
    key: "epv" as const,
    label: "Earnings Power Value",
    link: "/valuation/epv",
  },
];

function UpsideCell({ value }: { value: number }) {
  return (
    <td
      className={`py-2 pl-4 text-right font-mono font-semibold whitespace-nowrap ${
        value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted-foreground"
      }`}
    >
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </td>
  );
}

function ModelRow({ model, ticker }: { model: ValuationResult; ticker: string }) {
  const link = MODEL_LINKS[model.model_type];
  const href = link ? `/${ticker}${link}` : null;
  const name = MODEL_NAMES[model.model_type] ?? model.model_type;

  return (
    <tr className="border-b border-muted/20 hover:bg-muted/10">
      <td className="py-2 pr-4 pl-8 text-muted-foreground whitespace-nowrap">
        {href ? (
          <Link href={href} className="text-primary/80 hover:text-primary hover:underline">
            {name}
          </Link>
        ) : name}
      </td>
      <td className="py-2 px-4 text-right font-mono text-muted-foreground whitespace-nowrap">
        {model.fair_value > 0
          ? `${formatCurrency(model.low_estimate)} – ${formatCurrency(model.high_estimate)}`
          : "—"}
      </td>
      <td className="py-2 px-4 text-right font-mono">
        {model.fair_value > 0 ? formatCurrency(model.fair_value) : "N/A"}
      </td>
      {model.fair_value > 0 ? (
        <UpsideCell value={model.upside_percent} />
      ) : (
        <td className="py-2 pl-4 text-right text-muted-foreground">—</td>
      )}
    </tr>
  );
}

export function SummaryCard({ summary }: Props) {
  const verdict = VERDICT_CONFIG[summary.verdict];
  const { pillars } = summary;

  return (
    <div className="val-page">
      <h2 className="val-h2">
        {summary.company_name} ({summary.ticker}) Valuation Summary
      </h2>

      <ValuationHero
        fairValue={summary.consensus_fair_value}
        currentPrice={summary.current_price}
        upside={summary.consensus_upside}
        fairValueLabel="DCF FAIR VALUE"
        narrative={
          <>
            Using a 5-year unlevered FCFF model with Gordon Growth terminal value,{" "}
            {summary.company_name} ({summary.ticker}) has an intrinsic value of{" "}
            {formatCurrency(summary.consensus_fair_value)} (range:{" "}
            {formatCurrency(summary.consensus_low)} – {formatCurrency(summary.consensus_high)}),
            suggesting the stock is {verdict.label.toLowerCase()} by{" "}
            {Math.abs(summary.consensus_upside).toFixed(1)}% relative to its current
            market price of {formatCurrency(summary.current_price)}.
          </>
        }
      />

      <Card className="p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-brand/40">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Model</th>
                <th className="text-right py-2 px-4 font-medium text-muted-foreground">Range</th>
                <th className="text-right py-2 px-4 font-medium text-muted-foreground">Fair Value</th>
                <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Upside</th>
              </tr>
            </thead>
            <tbody>
              {PILLAR_CONFIG.map(({ key, label, link }) => {
                const pillar = pillars[key];

                return (
                  <PillarGroup
                    key={key}
                    label={label}
                    link={`/${summary.ticker}${link}`}
                    models={pillar.models}
                    ticker={summary.ticker}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Explanation */}
        <div className="val-prose pt-4 border-t border-muted/30">
          <p>
            <strong>How we calculated this:</strong>{" "}
            The fair value is derived from a 5-year unlevered FCFF model with line-by-line expense modeling,
            discounted at the WACC ({summary.wacc ? `${(summary.wacc.wacc * 100).toFixed(1)}%` : "—"}).
            The terminal value uses a Gordon Growth perpetual rate based on{" "}
            {summary.company_name}&apos;s classification as a{" "}
            <ClassificationTooltip classification={summary.classification} />{" "}
            company. Other models are shown below for reference.
          </p>
        </div>
      </Card>
    </div>
  );
}

// --- Pillar group row + child model rows ---
function PillarGroup({
  label, link, models, ticker,
}: {
  label: string;
  link: string;
  models: ValuationResult[];
  ticker: string;
}) {
  return (
    <>
      {/* Pillar header row */}
      <tr className="bg-muted/30 border-b border-muted/40">
        <td className="py-2.5 pr-4 font-semibold whitespace-nowrap">
          <Link href={link} className="text-primary hover:underline">
            ▸ {label}
          </Link>
        </td>
        <td className="py-2.5 px-4" />
        <td className="py-2.5 px-4" />
        <td className="py-2.5 pl-4" />
      </tr>
      {/* Child model rows — filtered to known models, sorted by preferred display order */}
      {[...models].filter(m => m.model_type in MODEL_NAMES).sort((a, b) => {
        const ai = MODEL_ORDER.indexOf(a.model_type);
        const bi = MODEL_ORDER.indexOf(b.model_type);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      }).map(model => (
        <ModelRow
          key={model.model_type}
          model={model}
          ticker={ticker}
        />
      ))}
    </>
  );
}

// --- Classification tooltip (extracted for reuse) ---
function ClassificationTooltip({ classification }: { classification: ValuationSummary["classification"] }) {
  return (
    <span className="group/tip relative inline-block">
      <strong className="underline decoration-dotted decoration-muted-foreground cursor-help">
        {classification.label}
        <svg className="inline-block ml-0.5 mb-0.5 size-3.5 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      </strong>
      <span className="pointer-events-none absolute left-0 bottom-full mb-2 z-50 w-64 rounded-md bg-foreground text-background text-xs p-3 opacity-0 transition-opacity group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto shadow-lg">
        <span className="font-semibold block mb-1">{classification.label}</span>
        <span className="block mb-1.5 text-background/80">{classification.description}</span>
        {classification.traits.length > 0 && (
          <span className="block border-t border-background/20 pt-1.5 space-y-0.5">
            {classification.traits.map((trait) => (
              <span key={trait} className="block">· {trait}</span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
