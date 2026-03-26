"use client";

import type { AnalystRecommendation, UpgradeDowngrade } from "@/types";

interface Props {
  recommendations: AnalystRecommendation;
  upgradesDowngrades: UpgradeDowngrade[];
}

const SEGMENTS = [
  { key: "strongBuy" as const, label: "Strong Buy", color: "bg-emerald-500" },
  { key: "buy" as const, label: "Buy", color: "bg-emerald-400" },
  { key: "hold" as const, label: "Hold", color: "bg-amber-400" },
  { key: "sell" as const, label: "Sell", color: "bg-red-400" },
  { key: "strongSell" as const, label: "Strong Sell", color: "bg-red-500" },
] as const;

function actionBadge(action: string) {
  const a = action.toLowerCase();
  if (a === "upgrade") return { label: "Upgrade", cls: "text-emerald-400" };
  if (a === "downgrade") return { label: "Downgrade", cls: "text-red-400" };
  if (a === "init" || a === "initiated") return { label: "Initiated", cls: "text-sky-400" };
  return { label: "Reiterated", cls: "text-muted-foreground" };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RatingDistribution({ recommendations, upgradesDowngrades }: Props) {
  const total = recommendations.totalAnalysts;
  if (total === 0) return null;

  // Filter to last 90 days for upgrades/downgrades
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoff = ninetyDaysAgo.toISOString().split("T")[0];
  const recentChanges = upgradesDowngrades.filter((u) => u.date >= cutoff);

  return (
    <div className="val-card">
      <h3 className="val-card-title">Rating Distribution</h3>

      {/* Stacked horizontal bar */}
      <div className="space-y-3">
        <div className="flex h-10 rounded-lg overflow-hidden">
          {SEGMENTS.map(({ key, color }) => {
            const count = recommendations[key];
            const pct = (count / total) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={key}
                className={`${color} flex items-center justify-center text-xs font-bold text-background transition-all`}
                style={{ width: `${pct}%`, minWidth: count > 0 ? "28px" : 0 }}
              >
                {count}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {SEGMENTS.map(({ key, label, color }) => {
            const count = recommendations[key];
            if (count === 0) return null;
            return (
              <span key={key} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm inline-block ${color}`} />
                {label} ({count})
              </span>
            );
          })}
        </div>
      </div>

      {/* Recent Upgrades/Downgrades */}
      {recentChanges.length > 0 && (
        <div className="space-y-2">
          <h4 className="val-h3">Recent Rating Changes (90 days)</h4>
          <div className="space-y-1">
            {recentChanges.slice(0, 6).map((u, i) => {
              const badge = actionBadge(u.action);
              return (
                <div key={i} className="val-row">
                  <span className="val-row-label">
                    {u.gradingCompany}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {u.previousGrade && u.newGrade && (
                      <span className="text-xs text-muted-foreground">
                        {u.previousGrade} → {u.newGrade}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(u.date)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
