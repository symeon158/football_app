import type { Metadata } from "next";
import { Suspense } from "react";

import { Panel } from "@/components/dashboard/panel";
import { Coins } from "@/components/game/coins";
import { StadiumIllustration } from "@/components/game/stadium-illustration";
import { CATEGORY_META } from "@/components/stadium/category-meta";
import { StadiumIdentity, UpgradePanel } from "@/components/stadium/stadium-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { getStadium } from "@/lib/data/stadium";
import { getViewer } from "@/lib/data/viewer";
import { formatNumber } from "@/lib/format";
import { CATEGORIES, costToMax, DESIGN_INFO, homeBonus, matchdayIncome, nextUpgrade } from "@/lib/game/stadium";

export const metadata: Metadata = { title: "Stadium" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export default function StadiumPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Suspense fallback={<StadiumSkeleton />}>
        <StadiumContent />
      </Suspense>
    </div>
  );
}

async function StadiumContent() {
  const viewer = await getViewer();
  const s = await getStadium(viewer.userId);
  const bonus = homeBonus(s.levels, s.costs);
  const remaining = costToMax(s.levels, s.costs);

  const stats = [
    { label: "Stadium level", value: `${s.level} / 5` },
    { label: "Capacity", value: `${formatNumber(s.capacity)} seats` },
    { label: "Home advantage", value: `+${bonus}%` },
    { label: "Matchday income", value: <Coins amount={matchdayIncome(s.capacity)} />, hint: "per home match, once the Match Centre opens" },
  ];

  return (
    <>
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Stadium builder</p>
        <StadiumIdentity name={s.name} design={s.design} levels={s.levels} />
      </header>

      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/60 shadow-2xl">
        {/* Remounting on level change replays the build-up animation. */}
        <div key={JSON.stringify(s.levels) + s.design} className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-700">
          <StadiumIllustration levels={s.levels} design={s.design} title={`${s.name}: ${DESIGN_INFO[s.design].label} design, level ${s.level}, ${formatNumber(s.capacity)} seats`} />
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur sm:left-5 sm:top-5">
          {DESIGN_INFO[s.design].label} · Level {s.level}
        </div>
      </section>

      <section aria-label="Stadium stats" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {stats.map((st) => (
          <div key={st.label} className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{st.label}</p>
            <p className="mt-1 text-xl font-bold tracking-tight">{st.value}</p>
            {st.hint && <p className="text-[11px] text-muted-foreground">{st.hint}</p>}
          </div>
        ))}
      </section>

      <section aria-labelledby="upgrades-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="upgrades-heading" className="text-lg font-semibold">Upgrades</h2>
          <p className="text-sm text-muted-foreground">
            {remaining > 0 ? <>Fully upgrading costs another <Coins amount={remaining} className="text-gold" /></> : "Your stadium is complete!"}
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CATEGORIES.map((c) => (
            <UpgradePanel
              // Keyed by category only: remounting after an upgrade would drop its confirmation.
              key={c}
              category={c}
              level={s.levels[c]}
              current={s.costs.find((x) => x.category === c && x.level === s.levels[c]) ?? null}
              next={nextUpgrade(c, s.levels[c], s.costs)}
              balance={viewer.balance}
            />
          ))}
        </ul>
      </section>

      <Panel title="Construction history">
        {s.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upgrades yet — every upgrade is paid for in Football Coins and recorded here.</p>
        ) : (
          <ul className="divide-y text-sm">
            {s.history.map((h) => {
              const { label, icon: Icon } = CATEGORY_META[h.category];
              return (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <Icon className="size-4 text-gold" />
                  <span className="flex-1"><span className="font-medium">{label}</span> {h.from_level} → {h.to_level}</span>
                  <span className="text-muted-foreground">{dateFmt.format(new Date(h.created_at))}</span>
                  <span className="w-20 text-right tabular-nums">−{formatNumber(h.cost)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

function StadiumSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading stadium">
      <Skeleton className="h-12 w-72" />
      <Skeleton className="aspect-[320/140] rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
    </div>
  );
}
