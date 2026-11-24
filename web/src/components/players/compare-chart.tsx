"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

import { SERIES_COLORS } from "./series-colors";

type Player = { name: string; values: number[] };

export function CompareChart({ players, labels }: { players: Player[]; labels: string[] }) {
  const data = labels.map((attr, i) => ({
    attr,
    ...Object.fromEntries(players.map((p, j) => [`p${j}`, p.values[i]])),
  }));
  const barSize = players.length === 3 ? 10 : 14;
  const height = labels.length * (players.length * (barSize + 2) + 26) + 40;

  return (
    <figure className="space-y-3">
      {/* Legend: always present for ≥2 series; text in ink colours, colour only on the swatch */}
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm" aria-label="Legend">
        {players.map((p, i) => (
          <li key={p.name + i} className="flex items-center gap-2">
            <span className="size-3 rounded-[3px]" style={{ background: SERIES_COLORS[i] }} aria-hidden />
            <span className="text-foreground">{p.name}</span>
          </li>
        ))}
      </ul>
      <div style={{ height }} className="[&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_*:focus]:outline-none" role="img" aria-label={`Attribute comparison of ${players.map((p) => p.name).join(", ")}. Full values in the table below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" barGap={2} barCategoryGap={12} margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeWidth={1} />
            <XAxis
              type="number"
              domain={[0, 99]}
              ticks={[0, 25, 50, 75, 99]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="attr"
              width={84}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.04)" }} content={(props) => <ChartTooltip {...props} players={players} />} />
            {players.map((p, i) => (
              <Bar key={p.name + i} dataKey={`p${i}`} name={p.name} fill={SERIES_COLORS[i]} barSize={barSize} radius={[0, 4, 4, 0]} animationDuration={600} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function ChartTooltip({ active, payload, label, players }: TooltipContentProps<ValueType, NameType> & { players: Player[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry, i) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[2px]" style={{ background: SERIES_COLORS[i] }} aria-hidden />
            <span className="text-muted-foreground">{players[i]?.name}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums text-foreground">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
