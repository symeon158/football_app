import { statLabels } from "@/lib/game/player";

type Stats = Record<"pace" | "shooting" | "passing" | "dribbling" | "defending" | "physicality", number | null>;

/**
 * Meter list: one aligned row per attribute (name · bar · value), each a ratio
 * against the 0–99 scale. One hue — the values are magnitudes, not categories.
 */
export function AttributeMeters({ position, stats }: { position: string; stats: Stats }) {
  return (
    <dl className="space-y-3">
      {statLabels(position).map(({ key, name, short }) => {
        const value = stats[key] ?? 0;
        return (
          <div key={key} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 sm:grid-cols-[8rem_1fr_2.5rem]">
            <dt className="text-sm text-muted-foreground">
              {name} <span className="sr-only">({short})</span>
            </dt>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${(value / 99) * 100}%` }} />
            </div>
            <dd className="text-right text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** ★★★☆☆ with an accessible label. */
export function Stars({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  return (
    <span role="img" aria-label={`${label}: ${value} out of ${max}`} className="tracking-[0.15em]">
      <span className="text-gold">{"★".repeat(value)}</span>
      <span className="text-muted-foreground/40">{"★".repeat(Math.max(0, max - value))}</span>
    </span>
  );
}
