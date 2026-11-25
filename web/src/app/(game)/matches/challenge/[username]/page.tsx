import { ArrowLeft, Swords } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Crest } from "@/components/game/crest";
import { KickoffForm } from "@/components/match/kickoff-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getFriendlyOpponent } from "@/lib/data/friendly";
import { getMatchCentre } from "@/lib/data/matches";
import { getManagerArea } from "@/lib/data/progression";
import { getFormations } from "@/lib/data/team";
import { getViewer } from "@/lib/data/viewer";
import { buildTeamSheet } from "@/lib/engine/team-sheet";
import { usernameSchema } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Challenge" };

export default function ChallengePage({ params }: PageProps<"/matches/challenge/[username]">) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Link href="/matches/challenge" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Choose another manager
      </Link>
      <Suspense fallback={<Skeleton className="h-[36rem] rounded-2xl" />}>
        <ChallengeContent params={params} />
      </Suspense>
    </div>
  );
}

async function ChallengeContent({ params }: Pick<PageProps<"/matches/challenge/[username]">, "params">) {
  const viewer = await getViewer();
  const username = decodeURIComponent((await params).username);
  if (!usernameSchema.safeParse(username).success) notFound();
  if (username.toLowerCase() === viewer.username.toLowerCase()) redirect("/matches");

  const now = new Date();
  const [opp, centre, formations, myArea, theirArea] = await Promise.all([
    getFriendlyOpponent(username),
    getMatchCentre(viewer.userId, now),
    getFormations(),
    getManagerArea(viewer.username),
    getManagerArea(username),
  ]);
  const derby = Boolean(myArea && theirArea && myArea.toLocaleLowerCase() === theirArea.toLocaleLowerCase());
  if (!opp) notFound();

  const built = opp.squad ? buildTeamSheet(opp.squad, formations[opp.squad.formation] ?? [], opp.cards, opp.squad.tactic) : null;
  const idempotencyKey = crypto.randomUUID();
  const played = opp.h2h.won + opp.h2h.drawn + opp.h2h.lost;

  return (
    <>
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Challenge a manager</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{opp.squad ? `vs ${opp.squad.name}` : opp.displayName}</h1>
        {derby ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-sm font-semibold text-gold">
            🔥 Local derby — both clubs are from {myArea}
          </p>
        ) : theirArea ? (
          <p className="mt-2 text-sm text-muted-foreground">📍 From {theirArea}{myArea ? ` · you're from ${myArea}` : ""}</p>
        ) : null}
      </header>

      {!opp.squad || !built?.ok ? (
        <EmptyState
          icon={<Swords className="size-5" />}
          title="This club can't be challenged yet"
          body={`${opp.username} doesn't have a full starting XI saved. Try again later or pick another manager.`}
        />
      ) : (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-label="Kick off" className="rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-6">
            <KickoffForm
              squads={centre.squads.map((s) => ({
                id: s.id, name: s.name, logoTemplate: s.logoTemplate, primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
                formation: s.formation, tactic: s.tactic, isActive: s.isActive, ready: s.ready, missing: s.missing, overall: s.overall, chemistry: s.chemistry,
              }))}
              idempotencyKey={idempotencyKey}
              rewards={centre.rewards}
              goalBonus={centre.limits.goal_bonus}
              goalBonusCap={centre.limits.goal_bonus_cap}
              matchdayIncome={centre.stadium.income}
              rewardedLeft={Math.max(0, centre.limits.rewarded_per_day - centre.today.rewarded)}
              rewardedPerDay={centre.limits.rewarded_per_day}
              playsLeft={Math.max(0, centre.limits.max_per_day - centre.today.played)}
              challenge={{
                username: opp.username,
                teamName: opp.squad.name,
                rewardedLeft: opp.rewardedLeftVsOpponent,
                rewardedPerOpponent: opp.rewardedPerOpponent,
              }}
            />
            <p className="mt-4 text-xs text-muted-foreground">
              You play at home in {centre.stadium.name} (+{centre.stadium.bonus}%) against {opp.username}&apos;s saved active squad.
              They don&apos;t need to be online — they&apos;ll see the result in their Match Centre. Challenges pay normal-difficulty rewards.
            </p>
          </section>

          <div className="space-y-4 sm:space-y-6">
            <Panel title="Opponent">
              <div className="flex items-center gap-3">
                <Crest template={opp.squad.logoTemplate} primary={opp.squad.primaryColor} secondary={opp.squad.secondaryColor} name={opp.squad.name} className="size-14" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{opp.squad.name}</p>
                  <Link href={`/managers/${encodeURIComponent(opp.username)}`} className="text-sm text-muted-foreground hover:text-primary">
                    {opp.username} · Lv {opp.level}
                  </Link>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[["Rating", built.overall], ["Chemistry", built.chemistry], ["Formation", opp.squad.formation]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-background/40 py-2">
                    <dt className="text-[11px] text-muted-foreground">{k}</dt>
                    <dd className="font-bold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs capitalize text-muted-foreground">Tactic: {opp.squad.tactic}</p>
            </Panel>

            <Panel title="Their starting XI">
              <ul className="divide-y text-sm">
                {built.sheet.starters.map(({ slotPosition, player }) => (
                  <li key={player.id ?? player.name} className="flex items-center gap-3 py-1.5">
                    <span className="w-10 shrink-0 text-xs font-semibold text-muted-foreground">{slotPosition}</span>
                    <span className="min-w-0 flex-1 truncate">{player.name}</span>
                    <span className="font-bold tabular-nums">{player.overall}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Head to head">
              {played === 0 ? (
                <p className="text-sm text-muted-foreground">You haven&apos;t played {opp.username} yet.</p>
              ) : (
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[["You won", opp.h2h.won], ["Drawn", opp.h2h.drawn], ["They won", opp.h2h.lost]].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-background/40 py-2">
                      <dt className="text-[11px] text-muted-foreground">{k}</dt>
                      <dd className="text-xl font-bold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
