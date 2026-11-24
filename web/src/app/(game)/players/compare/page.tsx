import { ArrowLeft, GitCompareArrows, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Coins } from "@/components/game/coins";
import { PlayerCard } from "@/components/game/player-card";
import { Stars } from "@/components/players/attribute-meters";
import { CompareChart, SERIES_COLORS } from "@/components/players/compare-chart";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getComparison } from "@/lib/data/collection";
import { getViewer } from "@/lib/data/viewer";
import { ageOn, STAT_KEYS, statLabels, toCardData } from "@/lib/game/player";
import { cn } from "@/lib/utils";
import { parseCompareIds } from "@/lib/validation/collection";

export const metadata: Metadata = { title: "Compare players" };

const MAX = 3;

export default function ComparePage({ searchParams }: PageProps<"/players/compare">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/collection" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Collection
      </Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Scouting report</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare players</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CompareContent({ searchParams }: Pick<PageProps<"/players/compare">, "searchParams">) {
  const viewer = await getViewer();
  const params = await searchParams;
  // `ids=a,b` from links, or repeated `slot=` from the picker form.
  const ids = parseCompareIds([params.ids, params.slot].flat().filter(Boolean).join(","));
  const { cards, options } = await getComparison(viewer.userId, ids);

  const allGk = cards.length > 0 && cards.every((c) => c.position === "GK");
  const mixedGk = cards.some((c) => c.position === "GK") && !allGk;
  const labels = statLabels(allGk ? "GK" : "ST");
  const now = new Date();

  // Picker options: the viewer's cards plus any compared card they don't own.
  const pickerOptions = [
    ...cards.filter((c) => !options.some((o) => o.card_id === c.card_id)).map((c) => ({ card_id: c.card_id, display_name: c.display_name, overall: c.overall, position: c.position })),
    ...options,
  ];
  const without = (id: string | null) => {
    const rest = cards.map((c) => c.card_id).filter((x) => x !== id);
    return rest.length ? `/players/compare?ids=${rest.join(",")}` : "/players/compare";
  };

  const rows: { label: string; values: (number | null)[]; render?: (v: number) => React.ReactNode; higherIsBetter?: boolean }[] = [
    { label: "Overall", values: cards.map((c) => c.overall), higherIsBetter: true },
    ...labels.map((l) => ({ label: l.name, values: cards.map((c) => c[l.key]), higherIsBetter: true })),
    { label: "Weak foot", values: cards.map((c) => c.weak_foot), render: (v: number) => <Stars value={v} label="Weak foot" />, higherIsBetter: true },
    { label: "Skill moves", values: cards.map((c) => c.skill_moves), render: (v: number) => <Stars value={v} label="Skill moves" />, higherIsBetter: true },
    { label: "Age", values: cards.map((c) => (c.birth_date ? ageOn(c.birth_date, now) : null)) },
    { label: "Height (cm)", values: cards.map((c) => c.height_cm) },
    { label: "Market value", values: cards.map((c) => c.market_price), render: (v: number) => <Coins amount={v} className="font-normal" /> },
  ];

  return (
    <>
      {/* ------------------------------------------------------------ picker */}
      <form action="/players/compare" method="get" className="flex flex-col gap-3 rounded-2xl border bg-card/70 p-4 backdrop-blur lg:flex-row lg:items-end">
        {Array.from({ length: MAX }, (_, i) => (
          <label key={i} className="flex-1 text-sm">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="size-2.5 rounded-[2px]" style={{ background: SERIES_COLORS[i] }} aria-hidden />
              Player {i + 1}
            </span>
            <select
              name="slot"
              defaultValue={cards[i]?.card_id ?? ""}
              className="h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <option value="">— None —</option>
              {pickerOptions.map((o) => (
                <option key={o.card_id} value={o.card_id ?? ""}>
                  {o.overall} {o.position} · {o.display_name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button type="submit" className={cn(buttonVariants(), "h-10 gap-2")}>
          <GitCompareArrows className="size-4" /> Compare
        </button>
      </form>

      {cards.length === 0 ? (
        <EmptyState
          icon={<GitCompareArrows className="size-5" />}
          title="Pick players to compare"
          body="Choose up to three cards above, or use “Compare with…” on any player's page."
        />
      ) : (
        <>
          {/* ----------------------------------------------------------- cards */}
          <ul className="grid grid-cols-3 gap-2 sm:gap-4 lg:max-w-3xl">
            {cards.map((c, i) => (
              <li key={c.card_id} className="relative">
                <div className="mb-2 h-1 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                <Link href={`/players/${c.card_id}`} className="block rounded-2xl">
                  <PlayerCard card={toCardData(c)} />
                </Link>
                <Link
                  href={without(c.card_id)}
                  aria-label={`Remove ${c.display_name} from comparison`}
                  className="absolute -right-2 top-1 flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow hover:text-foreground"
                >
                  <X className="size-4" />
                </Link>
              </li>
            ))}
          </ul>

          {cards.length >= 2 && (
            <Panel title="Attributes">
              {mixedGk && (
                <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Goalkeepers&apos; six ratings measure different skills (diving, handling…), so they are shown on outfield labels here.
                </p>
              )}
              <CompareChart
                labels={labels.map((l) => l.name)}
                players={cards.map((c) => ({ name: c.display_name ?? "Player", values: STAT_KEYS.map((k) => c[k] ?? 0) }))}
              />
            </Panel>
          )}

          {/* ----------------------------------------------------- table view */}
          <Panel title="Head to head">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th scope="col" className="py-2 pr-4 text-xs font-medium text-muted-foreground">Attribute</th>
                    {cards.map((c, i) => (
                      <th key={c.card_id} scope="col" className="py-2 pr-4 text-right font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2.5 rounded-[2px]" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                          {c.display_name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => {
                    const nums = row.values.filter((v): v is number => v !== null);
                    const best = row.higherIsBetter && cards.length > 1 && new Set(nums).size > 1 ? Math.max(...nums) : null;
                    return (
                      <tr key={row.label}>
                        <th scope="row" className="py-2.5 pr-4 text-left font-normal text-muted-foreground">{row.label}</th>
                        {row.values.map((v, i) => (
                          <td key={i} className={cn("py-2.5 pr-4 text-right tabular-nums", v === best && "font-bold text-foreground")}>
                            {v === null ? "—" : row.render ? row.render(v) : v}
                            {v === best && <span className="ml-1 text-primary" aria-label="best">▲</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
