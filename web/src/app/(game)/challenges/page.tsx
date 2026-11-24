import { CheckCircle2, Lock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Meter, Panel } from "@/components/dashboard/panel";
import { Coins } from "@/components/game/coins";
import { BadgeIcon } from "@/components/progression/badge-icon";
import { ClaimButton } from "@/components/progression/claim-button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAchievements, getChallenges, type ChallengeRow } from "@/lib/data/progression";
import { getViewer } from "@/lib/data/viewer";
import { formatRemaining } from "@/lib/game/periods";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Challenges" };

const SECTIONS: { period: ChallengeRow["period"]; title: string; blurb: string }[] = [
  { period: "daily", title: "Daily challenges", blurb: "Reset every day at midnight UTC." },
  { period: "weekly", title: "Weekly challenges", blurb: "Reset every Monday (UTC)." },
  { period: "team_building", title: "Team-building challenges", blurb: "Build the squad — claim once." },
  { period: "milestone", title: "Collection milestones", blurb: "Grow your club — claim once." },
];

export default function ChallengesPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Challenges &amp; achievements</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Goals to chase</h1>
        <p className="mt-1 text-sm text-muted-foreground">Progress updates automatically from your matches, cards, squads and stadium.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-[40rem] rounded-2xl" />}>
        <ChallengesContent />
      </Suspense>
    </div>
  );
}

async function ChallengesContent() {
  await getViewer();
  const [challenges, achievements] = await Promise.all([getChallenges(), getAchievements()]);
  const now = new Date();
  const ready = challenges.filter((c) => c.completed && !c.claimed).length + achievements.filter((a) => a.unlocked && !a.claimed).length;

  return (
    <>
      {ready > 0 && (
        <p role="status" className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-medium">
          🎁 {ready} reward{ready === 1 ? "" : "s"} ready to claim
        </p>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {SECTIONS.map(({ period, title, blurb }) => {
          const list = challenges.filter((c) => c.period === period);
          if (!list.length) return null;
          const ends = list[0].period_end ? new Date(list[0].period_end) : null;
          return (
            <Panel key={period} title={title}>
              <p className="-mt-2 mb-3 text-xs text-muted-foreground">
                {blurb}{ends && ` Resets in ${formatRemaining(ends.getTime() - now.getTime())}.`}
              </p>
              <ul className="space-y-3">
                {list.map((c) => (
                  <li key={c.id} className={cn("rounded-xl border bg-background/40 p-3", c.claimed && "opacity-60")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold">
                          {c.claimed && <CheckCircle2 className="size-4 text-primary" aria-label="claimed" />}
                          {c.title}
                        </p>
                        <p className="text-sm text-muted-foreground">{c.description}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <Coins amount={c.reward_coins} className="text-gold" />
                        <p className="text-muted-foreground">+{c.reward_xp} XP</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <Meter value={c.progress} max={c.target} className="flex-1" />
                      <span className="text-xs tabular-nums text-muted-foreground">{c.progress}/{c.target}</span>
                      {c.completed && !c.claimed && <ClaimButton kind="challenge" id={c.id} coins={c.reward_coins} xp={c.reward_xp} title={c.title} />}
                      {c.claimed && <span className="text-xs font-medium text-primary">Claimed</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>

      <Panel title="Achievements">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {achievements.map((a) => (
            <li key={a.id} className={cn("flex gap-3 rounded-xl border p-3", a.claimed ? "border-gold/40 bg-gold/5" : a.unlocked ? "border-primary/40 bg-primary/5" : "bg-background/40")}>
              <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", a.claimed ? "bg-gold text-black" : a.unlocked ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                {a.unlocked || a.claimed ? <BadgeIcon name={a.badge_icon} className="size-6" /> : <Lock className="size-5" aria-label="locked" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.description}</p>
                {!a.claimed && (
                  <div className="mt-2 flex items-center gap-2">
                    <Meter value={a.progress} max={a.target} className="flex-1" barClassName={a.unlocked ? "bg-primary" : undefined} />
                    <span className="text-[11px] tabular-nums text-muted-foreground">{a.progress}/{a.target}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {a.reward_coins > 0 && <Coins amount={a.reward_coins} className="text-xs text-gold" />}
                    {a.reward_xp > 0 && ` +${a.reward_xp} XP`}
                  </span>
                  {a.claimed ? <span className="font-medium text-gold">Earned</span> : a.unlocked ? <ClaimButton kind="achievement" id={a.id} coins={a.reward_coins} xp={a.reward_xp} title={a.title} /> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
