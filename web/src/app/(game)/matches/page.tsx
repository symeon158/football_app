import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Coins } from "@/components/game/coins";
import { KickoffForm } from "@/components/match/kickoff-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getMatchCentre } from "@/lib/data/matches";
import { getViewer } from "@/lib/data/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Match Centre" };

export default function MatchesPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Match Centre</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Play a match</h1>
      </header>
      <Suspense fallback={<MatchesSkeleton />}>
        <MatchesContent />
      </Suspense>
    </div>
  );
}

const resultOf = (h: number, a: number) =>
  h > a ? { label: "W", className: "bg-primary/20 text-primary" } : h === a ? { label: "D", className: "bg-muted text-muted-foreground" } : { label: "L", className: "bg-destructive/20 text-destructive" };

async function MatchesContent() {
  const viewer = await getViewer();
  const now = new Date();
  const c = await getMatchCentre(viewer.userId, now);
  // One key per rendered form: resubmitting the same form can't play twice.
  const idempotencyKey = crypto.randomUUID();

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Kick off" className="rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-6">
        <KickoffForm
          squads={c.squads.map((s) => ({
            id: s.id, name: s.name, logoTemplate: s.logoTemplate, primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
            formation: s.formation, tactic: s.tactic, isActive: s.isActive, ready: s.ready, missing: s.missing, overall: s.overall, chemistry: s.chemistry,
          }))}
          idempotencyKey={idempotencyKey}
          rewards={c.rewards}
          goalBonus={c.limits.goal_bonus}
          goalBonusCap={c.limits.goal_bonus_cap}
          matchdayIncome={c.stadium.income}
          rewardedLeft={Math.max(0, c.limits.rewarded_per_day - c.today.rewarded)}
          playsLeft={Math.max(0, c.limits.max_per_day - c.today.played)}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          Every match is simulated on our server from your saved line-up, chemistry, tactic and {c.stadium.name}&apos;s
          home advantage (+{c.stadium.bonus}%). Results are reproducible from their seed.
        </p>
      </section>

      <div className="space-y-4 sm:space-y-6">
        <Panel title="Season record">
          <dl className="grid grid-cols-4 gap-2 text-center">
            {[["P", c.totals.played], ["W", c.totals.won], ["D", c.totals.drawn], ["L", c.totals.lost]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-background/40 py-2">
                <dt className="text-[11px] font-semibold text-muted-foreground">{k}</dt>
                <dd className="text-xl font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            Goals {c.totals.goalsFor} for · {c.totals.goalsAgainst} against · Today {c.today.played}/{c.limits.max_per_day} played
          </p>
        </Panel>

        <Panel title="Recent results">
          {c.recent.length === 0 ? (
            <EmptyState icon={<Trophy className="size-5" />} title="No matches yet" body="Your results will appear here." />
          ) : (
            <ul className="divide-y">
              {c.recent.map((m) => {
                const r = resultOf(m.home_score, m.away_score);
                return (
                  <li key={m.id}>
                    <Link href={`/matches/${m.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-black", r.className)}>{r.label}</span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-bold tabular-nums">{m.home_score}–{m.away_score}</span>{" "}
                        <span className="text-muted-foreground">vs {m.opponent_name}</span>
                      </span>
                      {m.reward_coins > 0 && <Coins amount={m.reward_coins} className="text-xs text-gold" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]" aria-busy="true" aria-label="Loading Match Centre">
      <Skeleton className="h-[34rem] rounded-2xl" />
      <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
    </div>
  );
}
