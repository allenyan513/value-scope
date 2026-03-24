// Beat/miss surprise table for estimate charts

interface BeatMissPoint {
  year: string;
  beatMiss: number | null;
}

interface EstimateBeatMissTableProps {
  actualPoints: BeatMissPoint[];
}

export function EstimateBeatMissTable({ actualPoints }: EstimateBeatMissTableProps) {
  const withBeatMiss = actualPoints.filter((p) => p.beatMiss !== null);
  if (withBeatMiss.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b">
            <th className="p-2 text-left font-medium text-muted-foreground">
              Year
            </th>
            {withBeatMiss.map((p) => (
              <th
                key={p.year}
                className="p-2 text-center font-medium text-muted-foreground"
              >
                {p.year}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 font-medium text-muted-foreground">
              Surprise
            </td>
            {withBeatMiss.map((p) => {
              const isBeat = (p.beatMiss ?? 0) >= 0;
              return (
                <td
                  key={p.year}
                  className={`p-2 text-center font-mono font-semibold ${
                    isBeat ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {isBeat ? "Beat" : "Miss"}{" "}
                  {((p.beatMiss ?? 0) * 100).toFixed(1)}%
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
