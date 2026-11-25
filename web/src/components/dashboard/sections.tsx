import { Armchair, Dumbbell, Lightbulb, Layers, Sprout, Swords, Target, Trophy, Users } from "lucide-react";
import Link from "next/link";

import { Coins } from "@/components/game/coins";
import { Crest } from "@/components/game/crest";
import { PlayerCard } from "@/components/game/player-card";
import { StadiumIllustration } from "@/components/game/stadium-illustration";
import { buttonVariants } from "@/components/ui/button";
import type { Dashboard, StadiumCategory } from "@/lib/data/dashboard";
import type { Viewer } from "@/lib/data/viewer";
import { formatNumber } from "@/lib/format";
import { formatRemaining } from "@/lib/game/periods";
import { levelProgress } from "@/lib/game/progression";
import type { StadiumDesign } from "@/lib/game/stadium";
import { cn } from "@/lib/utils";

import { EmptyState, Meter, Panel } from "./panel";

/* ------------------------------------------------------------------ hero */

export function Hero({ viewer, team }: { viewer: Viewer; team: Dashboard["team"] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-950/80 via-card to-card p-5 sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          {team && (
            <Crest
              template={team.logoTemplate}
              primary={team.primaryColor}
              secondary={team.secondaryColor}
              name={team.name}
              className="size-16 drop-shadow-lg sm:size-20"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Welcome back, manager</p>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{viewer.displayName}</h1>
            {team && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {team.name} · {team.formation} · <span className="capitalize">{team.tactic}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-5">
          {team && (
            <div className="text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Team rating</p>
              <p className="bg-gradient-to-b from-white to-emerald-200 bg-clip-text text-5xl font-black tabular-nums text-transparent">
                {team.overall}
              </p>
              {team.startersFilled < 11 && (
                <p className="text-[11px] text-destructive">{11 - team.startersFilled} slot(s) empty</p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Link href="/matches" className={cn(buttonVariants({ size: "lg" }), "gap-2 px-5")}>
              <Swords className="size-4" /> Play match
            </Link>
            <Link href="/team" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "gap-2 px-5")}>
              <Users className="size-4" /> Edit team
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ stat tiles */

export function StatTiles({ viewer, data }: { viewer: Viewer; data: Dashboard }) {
  const progress = levelProgress(viewer.xp, viewer.level);
  const tiles = [
    {
      label: "Manager level",
      value: <span>Lv. {viewer.level}</span>,
      foot: (
        <>
          <Meter value={progress.xpIntoLevel} max={progress.xpForNextLevel || 1} barClassName="bg-gradient-to-r from-primary to-emerald-300" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {progress.isMax
              ? "Max level reached"
              : `${formatNumber(progress.xpIntoLevel)} / ${formatNumber(progress.xpForNextLevel)} XP to Lv. ${viewer.level + 1}`}
          </p>
        </>
      ),
    },
    {
      label: "Football Coins",
      value: <Coins amount={viewer.balance} className="text-gold [&_svg]:size-6" />,
      foot: <p className="text-xs text-muted-foreground">Earned through matches & challenges</p>,
    },
    {
      label: "Collection",
      value: <span>{formatNumber(data.collection.total)} cards</span>,
      foot: <p className="text-xs text-muted-foreground">{data.collection.special} rare or better</p>,
    },
    {
      label: "Stadium",
      value: <span>Level {data.stadium.level}</span>,
      foot: <p className="text-xs text-muted-foreground">{formatNumber(data.stadium.capacity)} seats</p>,
    },
  ];

  return (
    <section aria-label="Club summary" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col justify-between gap-3 rounded-2xl border bg-card/70 p-4 backdrop-blur">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.label}</p>
          <div className="text-xl font-bold tracking-tight sm:text-2xl">{t.value}</div>
          <div>{t.foot}</div>
        </div>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------- latest cards */

export function LatestCards({ cards }: { cards: Dashboard["latestCards"] }) {
  return (
    <Panel title="Latest player cards" href="/collection" linkLabel="Collection" className="lg:col-span-8">
      {cards.length === 0 ? (
        <EmptyState icon={<Layers className="size-5" />} title="No cards yet" body="Cards you collect will appear here." />
      ) : (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {cards.map((c) => (
            <li key={c.ownershipId} className="w-36 shrink-0 snap-start sm:w-auto">
              <Link href={`/players/${c.id}`} className="block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring">
                <PlayerCard card={c} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ challenges */

export function Challenges({ challenges, now }: { challenges: Dashboard["challenges"]; now: Date }) {
  return (
    <Panel title="Challenges" href="/challenges" className="lg:col-span-4">
      {challenges.length === 0 ? (
        <EmptyState icon={<Target className="size-5" />} title="All caught up" body="New challenges arrive daily." />
      ) : (
        <ul className="space-y-3">
          {challenges.map((c) => (
            <li key={c.id} className="rounded-xl border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        c.period === "daily" ? "bg-primary/15 text-primary" : "bg-sky-500/15 text-sky-300",
                      )}
                    >
                      {c.period}
                    </span>
                    <p className="truncate text-sm font-semibold">{c.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                </div>
                <Coins amount={c.reward_coins} className="shrink-0 text-xs text-gold" />
              </div>
              <div className="mt-2.5 flex items-center gap-3">
                <Meter value={c.progress} max={c.target} className="flex-1" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {c.progress}/{c.target}
                </span>
              </div>
              {c.completed && !c.claimed ? (
                <Link href="/challenges" className="mt-1.5 inline-block text-xs font-semibold text-gold hover:underline">
                  Ready — claim reward →
                </Link>
              ) : c.claimed ? (
                <p className="mt-1.5 text-[11px] font-medium text-primary">Claimed ✓</p>
              ) : (
                c.endsAt && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Resets in {formatRemaining(c.endsAt.getTime() - now.getTime())}
                  </p>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- recent matches */

function resultOf(m: Dashboard["matches"][number]) {
  if (m.home_score > m.away_score) return { label: "W", className: "bg-primary/20 text-primary" };
  if (m.home_score < m.away_score) return { label: "L", className: "bg-destructive/20 text-destructive" };
  return { label: "D", className: "bg-muted text-muted-foreground" };
}

export function RecentMatches({ matches, teamName }: { matches: Dashboard["matches"]; teamName?: string }) {
  return (
    <Panel title="Recent results" href="/matches" linkLabel="Match Centre" className="lg:col-span-7">
      {matches.length === 0 ? (
        <EmptyState
          icon={<Trophy className="size-5" />}
          title="No matches played yet"
          body="Take your starter squad onto the pitch to earn coins and XP."
          action={
            <Link href="/matches" className={cn(buttonVariants({ size: "sm" }), "mt-2")}>
              Go to Match Centre
            </Link>
          }
        />
      ) : (
        <ul className="divide-y">
          {matches.map((m) => {
            const r = resultOf(m);
            return (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className={cn("flex size-7 items-center justify-center rounded-md text-xs font-black", r.className)}>{r.label}</span>
                <p className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{teamName ?? "You"}</span>
                  <span className="mx-2 font-bold tabular-nums">
                    {m.home_score} – {m.away_score}
                  </span>
                  <span className="text-muted-foreground">{m.opponent_name}</span>
                </p>
                {m.reward_coins > 0 && <Coins amount={m.reward_coins} className="text-xs text-gold" />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- stadium status */

const CATEGORY_META: Record<StadiumCategory, { label: string; icon: typeof Armchair }> = {
  seating: { label: "Stands", icon: Armchair },
  lighting: { label: "Floodlights", icon: Lightbulb },
  pitch: { label: "Surface", icon: Sprout },
  facilities: { label: "Clubhouse", icon: Dumbbell },
};

export function StadiumStatus({ stadium }: { stadium: Dashboard["stadium"] }) {
  const levels = Object.fromEntries(stadium.upgrades.map((u) => [u.category, u.level])) as Record<StadiumCategory, number>;
  return (
    <Panel title="Home ground" href="/stadium" linkLabel="Upgrade" className="lg:col-span-5">
      <div className="overflow-hidden rounded-xl border bg-gradient-to-b from-slate-950 to-slate-900">
        <StadiumIllustration levels={levels} design={stadium.design as StadiumDesign} title={`${stadium.name}, level ${stadium.level}`} />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="truncate font-semibold">{stadium.name}</p>
        <p className="shrink-0 text-xs text-muted-foreground">{formatNumber(stadium.capacity)} seats</p>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        {stadium.upgrades.map((u) => {
          const { label, icon: Icon } = CATEGORY_META[u.category];
          return (
            <li key={u.category}>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon className="size-3.5 text-muted-foreground" />
                  {label}
                </span>
                <span className="tabular-nums text-muted-foreground">{u.level}/5</span>
              </div>
              <Meter value={u.level} max={5} className="mt-1.5" barClassName="bg-gold" />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {u.nextCost === null ? "Maxed out" : <>Next: <Coins amount={u.nextCost} className="text-[11px] [&_svg]:size-3" /></>}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
