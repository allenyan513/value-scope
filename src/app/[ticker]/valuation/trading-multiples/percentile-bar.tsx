"use client";

interface Props {
  percentile: number | null;
  label?: string;
}

/**
 * Compact horizontal percentile bar.
 * Green (cheap) on the left, red (expensive) on the right.
 * A pointer shows where the current value sits in 5Y history.
 */
export function PercentileBar({ percentile, label }: Props) {
  if (percentile === null) return null;

  // Clamp to 0-100
  const pct = Math.max(0, Math.min(100, percentile));

  // Color based on percentile: low = cheap (green), high = expensive (red)
  const getColor = (p: number) => {
    if (p <= 30) return "text-green-400";
    if (p <= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const getLabel = (p: number) => {
    if (p <= 20) return "Very Cheap";
    if (p <= 40) return "Below Avg";
    if (p <= 60) return "Fair";
    if (p <= 80) return "Above Avg";
    return "Expensive";
  };

  return (
    <div className="space-y-1">
      {label && <div className="text-[10px] text-muted-foreground">{label}</div>}
      <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-green-900/60 via-yellow-900/40 to-red-900/60">
        {/* Pointer */}
        <div
          className="absolute top-0 h-full w-1 bg-white rounded-full shadow-sm"
          style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className={`text-[10px] font-medium ${getColor(pct)}`}>
          {getLabel(pct)}
        </span>
        <span className={`text-[10px] font-mono ${getColor(pct)}`}>
          {pct}th pctl
        </span>
      </div>
    </div>
  );
}
