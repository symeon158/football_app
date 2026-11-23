import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getClubOverview } from "@/lib/data/club";
import { requireUserId } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const RARITY_STYLES: Record<string, string> = {
  common: "text-zinc-300 border-zinc-500/40",
  rare: "text-sky-300 border-sky-400/40",
  epic: "text-fuchsia-300 border-fuchsia-400/40",
  legendary: "text-gold border-gold/50",
  icon: "text-amber-100 border-amber-200/60",
};

const fc = new Intl.NumberFormat("en-GB");

/**
 * Phase 1 dashboard: a functional check that sign-up provisioning, RLS and
 * the Supabase connection work end-to-end. Fully designed in Phase 2.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your club">
      <div className="h-14 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

async function DashboardContent() {
  const userId = await requireUserId();
  const club = await getClubOverview(userId);

  const stats = [
    { label: "Manager level", value: club.profile.level.toString(), sub: `${fc.format(club.profile.xp)} XP` },
    { label: "Football Coins", value: `${fc.format(club.balance)} FC`, sub: "Earned through gameplay", accent: true },
    { label: "Cards owned", value: club.cards.length.toString(), sub: "Starter collection" },
    {
      label: "Stadium",
      value: club.stadium.name,
      sub: `Level ${club.stadium.stadium_level ?? 1} · ${fc.format(club.stadium.capacity ?? 0)} seats`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Welcome, manager</p>
        <h1 className="text-3xl font-bold tracking-tight">{club.profile.display_name ?? club.profile.username}</h1>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Club summary">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("truncate text-2xl font-bold", s.accent && "text-gold")}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">Your starter squad</h2>
          {club.team && (
            <p className="text-sm text-muted-foreground">
              {club.team.name} · {club.team.formation} · {club.team.tactic}
            </p>
          )}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {club.cards.map(({ id, card }) => (
            <li
              key={id}
              className={cn(
                "flex items-center gap-4 rounded-xl border bg-card px-4 py-3",
                RARITY_STYLES[card.rarity],
              )}
            >
              <div className="w-10 text-center">
                <p className="text-2xl font-bold leading-none">{card.overall}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{card.position}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {card.player.first_name} {card.player.last_name}
                  {club.team?.captain_ownership_id === id && (
                    <span className="ml-2 rounded bg-gold px-1 text-[10px] font-bold text-black" title="Captain">
                      C
                    </span>
                  )}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {card.rarity} · {card.player.nationality}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
