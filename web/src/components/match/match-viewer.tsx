"use client";

import { ArrowLeftRight, Award, FastForward, Hand, Pause, Play, RotateCcw, SkipForward, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Coins } from "@/components/game/coins";
import { SERIES_COLORS } from "@/components/players/series-colors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewerEvent = {
  seq: number;
  minute: number;
  type: string;
  side: "home" | "away" | null;
  player: string | null;
  assist: string | null;
  detail: string | null;
};
type Stats = { possession: number; shots: number; shotsOnTarget: number; xg: number; yellowCards: number; redCards: number; saves: number };
type Rating = { side: "home" | "away"; name: string; position: string; rating: number; goals: number; assists: number };

type Props = {
  homeName: string;
  awayName: string;
  events: ViewerEvent[];
  stats: { home: Stats; away: Stats };
  ratings: Rating[];
  manOfTheMatch: Rating | null;
  rewards: { coins: number; xp: number; rewarded: boolean };
  /** Set when the viewer's club was the challenged (away) side: the challenger's username. */
  defendingAgainst?: string | null;
  /** Set for a challenge the viewer played: the opponent's username (explains the per-opponent cap). */
  challengeOpponent?: string | null;
  levelUp: number | null;
  live: boolean;
};

const HOME = SERIES_COLORS[0];
const AWAY = SERIES_COLORS[1];
const SPEEDS = [{ label: "1×", ms: 230 }, { label: "4×", ms: 60 }] as const;

function EventIcon({ type }: { type: string }) {
  if (type === "goal") return <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-primary text-[13px]">⚽</span>;
  if (type === "yellow_card") return <span aria-hidden className="h-5 w-3.5 rounded-[3px] bg-yellow-400" />;
  if (type === "red_card") return <span aria-hidden className="h-5 w-3.5 rounded-[3px] bg-red-500" />;
  if (type === "substitution") return <ArrowLeftRight aria-hidden className="size-4 text-sky-300" />;
  if (type === "save") return <Hand aria-hidden className="size-4 text-muted-foreground" />;
  if (type === "chance") return <Target aria-hidden className="size-4 text-muted-foreground" />;
  return <span aria-hidden className="size-2 rounded-full bg-muted-foreground" />;
}

function describe(e: ViewerEvent) {
  switch (e.type) {
    case "kickoff": return "Kick-off";
    case "half_time": return `Half time · ${e.detail}`;
    case "full_time": return `Full time · ${e.detail}`;
    case "goal": return `GOAL! ${e.player}${e.assist ? ` (assist ${e.assist})` : ""}`;
    case "yellow_card": return `Yellow card · ${e.player}`;
    case "red_card": return `Red card · ${e.player}${e.detail ? ` (${e.detail.toLowerCase()})` : ""}`;
    case "substitution": return `${e.player} on, ${e.assist} off`;
    case "save": return `Save · ${e.player ?? "Goalkeeper"}${e.detail ? ` — ${e.detail}` : ""}`;
    case "chance": return `${e.detail ?? "Chance"} · ${e.player}`;
    default: return e.detail ?? e.type;
  }
}

export function MatchViewer({ homeName, awayName, events, stats, ratings, manOfTheMatch, rewards, levelUp, live, defendingAgainst, challengeOpponent }: Props) {
  const lastIndex = events.length - 1;
  // Playback = match clock + number of events revealed, advanced together by one pure update.
  const [{ clock, shown }, setPlayback] = useState(live ? { clock: 0, shown: 1 } : { clock: 90, shown: events.length });
  const [playing, setPlaying] = useState(live);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(SPEEDS[0]);
  const finished = shown > lastIndex;
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  // While the live replay runs, mask the top bar's coins/level (already
  // updated server-side) so the reward doesn't give away the result.
  useEffect(() => {
    if (finished) return;
    document.documentElement.dataset.matchLive = "1";
    return () => {
      delete document.documentElement.dataset.matchLive;
    };
  }, [finished]);
  const skipToEnd = () => { setPlayback({ clock: 90, shown: events.length }); setPlaying(false); };
  const restart = () => { setPlayback({ clock: 0, shown: 1 }); setPlaying(true); };

  // Reduced motion: skip straight to the result.
  useEffect(() => {
    if (live && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => { setPlayback({ clock: 90, shown: events.length }); setPlaying(false); }, 0);
      return () => clearTimeout(t);
    }
  }, [live, events.length]);

  // One minute per tick; reveal every event up to the new minute.
  useEffect(() => {
    if (!playing || finished) return;
    timer.current = setInterval(() => {
      setPlayback(({ clock: c, shown: s }) => {
        const next = Math.min(90, c + 1);
        let n = s;
        while (n <= lastIndex && events[n].minute <= next) n++;
        return { clock: next, shown: next >= 90 ? events.length : n };
      });
    }, speed.ms);
    return () => clearInterval(timer.current);
  }, [playing, finished, speed, events, lastIndex]);

  const visible = useMemo(() => events.slice(0, shown), [events, shown]);
  const score = visible.reduce((s, e) => (e.type === "goal" && e.side ? { ...s, [e.side]: s[e.side] + 1 } : s), { home: 0, away: 0 });
  const lastGoal = [...visible].reverse().find((e) => e.type === "goal");
  const phase = finished ? "Full time" : visible.some((e) => e.type === "half_time") && clock <= 46 ? "Half time" : clock <= 45 ? "First half" : "Second half";

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Scoreboard */}
      <section aria-label="Scoreboard" className="relative overflow-hidden rounded-3xl border bg-gradient-to-b from-slate-900 to-emerald-950/70 p-5 sm:p-8">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <p className="truncate text-right text-base font-bold sm:text-2xl">
            <span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: HOME }} aria-hidden />
            {homeName}
          </p>
          <p className="text-center" aria-live="polite">
            <span key={`${score.home}-${score.away}`} className="block text-4xl font-black tabular-nums motion-safe:animate-in motion-safe:zoom-in-90 sm:text-6xl">
              {score.home} – {score.away}
            </span>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-widest text-gold">
              {finished ? "Full time" : `${phase} · ${clock}'`}
            </span>
          </p>
          <p className="truncate text-base font-bold sm:text-2xl">
            {awayName}
            <span className="ml-2 inline-block size-3 rounded-full align-middle" style={{ background: AWAY }} aria-hidden />
          </p>
        </div>
        {/* Match progress */}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-gold transition-[width] duration-200" style={{ width: `${(clock / 90) * 100}%` }} />
        </div>
        {lastGoal && !finished && (
          <p className="mt-3 text-center text-sm text-white/80">⚽ {lastGoal.player} {lastGoal.minute}&apos;</p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {!finished ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)} className="gap-1.5">
                {playing ? <><Pause className="size-3.5" /> Pause</> : <><Play className="size-3.5" /> Play</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSpeed(speed === SPEEDS[0] ? SPEEDS[1] : SPEEDS[0])} className="gap-1.5" aria-label={`Speed ${speed.label}, change speed`}>
                <FastForward className="size-3.5" /> {speed.label}
              </Button>
              <Button size="sm" variant="ghost" onClick={skipToEnd} className="gap-1.5">
                <SkipForward className="size-3.5" /> Skip to result
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={restart} className="gap-1.5">
              <RotateCcw className="size-3.5" /> Watch replay
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Timeline */}
        <section aria-labelledby="timeline-h" className="rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-5">
          <h2 id="timeline-h" className="mb-3 font-semibold">Match timeline</h2>
          <ol className="max-h-[30rem] space-y-1.5 overflow-y-auto pr-1">
            {[...visible].reverse().map((e) => (
              <li
                key={e.seq}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1",
                  e.type === "goal" && "bg-primary/10 font-semibold",
                  e.side === "away" && "flex-row-reverse text-right",
                )}
              >
                <span className="w-9 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{e.type === "kickoff" ? "0'" : `${e.minute}'`}</span>
                <span className="flex w-6 shrink-0 justify-center"><EventIcon type={e.type} /></span>
                <span className="min-w-0 flex-1">
                  {e.side && <span className="sr-only">{e.side === "home" ? homeName : awayName}: </span>}
                  {describe(e)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Final stats / rewards (revealed at full time) */}
        <div className="space-y-4 sm:space-y-6">
          {finished ? (
            <>
              <section aria-labelledby="stats-h" className="rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-5">
                <h2 id="stats-h" className="mb-3 flex items-center justify-between font-semibold">
                  Match stats
                  <span className="flex gap-3 text-xs font-normal text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="size-2.5 rounded-[2px]" style={{ background: HOME }} />{homeName}</span>
                    <span className="flex items-center gap-1"><span className="size-2.5 rounded-[2px]" style={{ background: AWAY }} />{awayName}</span>
                  </span>
                </h2>
                <dl className="space-y-3">
                  {([
                    ["Possession", "possession", "%"], ["Shots", "shots", ""], ["On target", "shotsOnTarget", ""],
                    ["Expected goals (xG)", "xg", ""], ["Saves", "saves", ""], ["Yellow cards", "yellowCards", ""], ["Red cards", "redCards", ""],
                  ] as const).map(([label, key, unit]) => {
                    const h = stats.home[key], a = stats.away[key];
                    const total = h + a || 1;
                    return (
                      <div key={key}>
                        <div className="flex justify-between text-sm">
                          <dd className="font-semibold tabular-nums">{h}{unit}</dd>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-semibold tabular-nums">{a}{unit}</dd>
                        </div>
                        <div className="mt-1 flex h-1.5 gap-[2px] overflow-hidden rounded-full" aria-hidden>
                          <div className="rounded-l-full" style={{ width: `${(h / total) * 100}%`, background: HOME }} />
                          <div className="rounded-r-full" style={{ width: `${(a / total) * 100}%`, background: AWAY }} />
                        </div>
                      </div>
                    );
                  })}
                </dl>
              </section>

              <section aria-labelledby="rewards-h" className="rounded-2xl border border-gold/30 bg-gold/5 p-4 sm:p-5">
                <h2 id="rewards-h" className="mb-2 font-semibold">Rewards</h2>
                {defendingAgainst ? (
                  <div className="text-sm">
                    <p className="font-semibold">{defendingAgainst} challenged your club</p>
                    <p className="text-muted-foreground">Defending doesn&apos;t pay coins or XP. Challenge them back to earn rewards.</p>
                  </div>
                ) : rewards.rewarded ? (
                  <div className="flex flex-wrap items-center gap-4 text-lg font-bold">
                    <Coins amount={rewards.coins} className="text-gold" />
                    <span className="text-primary">+{rewards.xp} XP</span>
                    {levelUp && <span className="rounded-full bg-gold px-3 py-0.5 text-sm font-black text-black">Level up! Now level {levelUp}</span>}
                  </div>
                ) : (
                  <div className="text-sm">
                    <p className="font-semibold">No coins or XP: friendly match</p>
                    <p className="text-muted-foreground">
                      {challengeOpponent
                        ? `You had already used today's paid matches, or the 5 paid matches against ${challengeOpponent}.`
                        : "You had already played today's paid matches."}{" "}
                      The allowance resets at midnight UTC.
                    </p>
                  </div>
                )}
              </section>

              {manOfTheMatch && (
                <section aria-label="Man of the match" className="flex items-center gap-3 rounded-2xl border bg-card/70 p-4">
                  <Award className="size-8 text-gold" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Man of the match</p>
                    <p className="font-semibold">{manOfTheMatch.name} <span className="text-muted-foreground">({manOfTheMatch.side === "home" ? homeName : awayName})</span></p>
                  </div>
                  <span className="ml-auto text-2xl font-black tabular-nums text-gold">{manOfTheMatch.rating.toFixed(1)}</span>
                </section>
              )}
            </>
          ) : (
            <section className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Stats, ratings and rewards appear at full time.
            </section>
          )}
        </div>
      </div>

      {finished && (
        <section aria-labelledby="ratings-h" className="rounded-2xl border bg-card/70 p-4 backdrop-blur sm:p-5">
          <h2 id="ratings-h" className="mb-3 font-semibold">Your player ratings</h2>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {ratings.filter((r) => r.side === "home").sort((a, b) => b.rating - a.rating).map((r) => (
              <li key={r.name} className="flex items-center gap-3 text-sm">
                <span className="w-9 text-xs font-semibold text-muted-foreground">{r.position}</span>
                <span className="min-w-0 flex-1 truncate">{r.name}{r.goals > 0 && ` ${"⚽".repeat(r.goals)}`}{r.assists > 0 && <span className="text-muted-foreground"> · {r.assists} ast</span>}</span>
                <span className={cn("w-10 rounded px-1.5 text-center font-bold tabular-nums", r.rating >= 7.5 ? "bg-primary/20 text-primary" : r.rating < 6 ? "bg-destructive/15 text-destructive" : "bg-muted")}>
                  {r.rating.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
