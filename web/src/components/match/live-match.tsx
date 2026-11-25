"use client";

import { FastForward, Loader2, SkipForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { decideMoment, resumeMatch } from "@/app/(game)/matches/actions";
import { SERIES_COLORS } from "@/components/players/series-colors";
import { Button } from "@/components/ui/button";
import type { LiveEvent, LiveSegment } from "@/lib/engine/live";
import { cn } from "@/lib/utils";

import { describe, EventIcon } from "./match-viewer";

const HOME = SERIES_COLORS[0];
const AWAY = SERIES_COLORS[1];
const SPEEDS = [{ label: "1×", ms: 220 }, { label: "3×", ms: 70 }] as const;

type Props = {
  matchId: string;
  homeName: string;
  awayName: string;
  initial: LiveSegment | null;
  needsFinish: boolean;
};

/** Where the ball sits on the pitch (0–100 across the length) after an event. */
function ballAfter(e: LiveEvent | undefined): { x: number; y: number } {
  if (!e) return { x: 50, y: 50 };
  const attackX = e.side === "home" ? 88 : 12; // home attacks to the right
  switch (e.type) {
    case "goal": return { x: e.side === "home" ? 99 : 1, y: 50 };
    case "chance": return { x: attackX, y: 38 };
    case "save": return { x: e.side === "home" ? 6 : 94, y: 52 }; // the keeper's side (side = keeper's team)
    case "kickoff":
    case "half_time": return { x: 50, y: 50 };
    default: return { x: e.side === "home" ? 62 : e.side === "away" ? 38 : 50, y: 50 };
  }
}

export function LiveMatch({ matchId, homeName, awayName, initial, needsFinish }: Props) {
  const router = useRouter();
  const [segment, setSegment] = useState<LiveSegment | null>(initial);
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(SPEEDS[0]);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const target = segment?.moment.minute ?? 90;
  const visible = useMemo(() => (segment?.events ?? []).filter((e) => e.minute <= clock || e.type === "kickoff"), [segment, clock]);
  const deciding = Boolean(segment) && clock >= target;
  const score = visible.reduce((s, e) => (e.type === "goal" && e.side ? { ...s, [e.side]: s[e.side] + 1 } : s), { home: 0, away: 0 });
  const last = visible.at(-1);
  const flash = last && last.minute >= clock - 1 && (last.type === "goal" || last.type === "save" || last.type === "chance") ? last : null;
  const ball = segment && deciding && segment.moment.kind !== "team_talk" && segment.moment.kind !== "late_call"
    ? { x: segment.moment.kind === "penalty" ? 89 : 84, y: segment.moment.kind === "penalty" ? 50 : 40 }
    : ballAfter(last);

  // Hide the top bar's coin/level changes until the match is over.
  useEffect(() => {
    document.documentElement.dataset.matchLive = "1";
    return () => {
      delete document.documentElement.dataset.matchLive;
    };
  }, []);

  // Every decision already made (e.g. after a dropped connection): settle and show the result.
  useEffect(() => {
    if (!needsFinish) return;
    startSending(async () => {
      const r = await resumeMatch(matchId);
      if (!r.ok) setError(r.message);
      else router.replace(`/matches/${matchId}?live=1&from=75`);
    });
  }, [needsFinish, matchId, router]);

  // The clock runs one minute per tick until the next key moment.
  useEffect(() => {
    if (!segment || deciding) return;
    timer.current = setInterval(() => setClock((c) => Math.min(target, c + 1)), speed.ms);
    return () => clearInterval(timer.current);
  }, [segment, deciding, target, speed]);

  const choose = (choice: string) => {
    if (!segment) return;
    const minute = segment.moment.minute;
    setError(null);
    startSending(async () => {
      const r = await decideMoment(matchId, segment.moment.index, choice);
      if (!r.ok) {
        setError(r.message);
        router.refresh();
        return;
      }
      if (r.done || !r.segment) {
        router.replace(`/matches/${matchId}?live=1&from=${minute}`);
        return;
      }
      setSegment(r.segment);
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Scoreboard */}
      <section aria-label="Scoreboard" className="rounded-3xl border bg-gradient-to-b from-slate-900 to-emerald-950/70 p-5 sm:p-6">
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
              {clock <= 45 ? "First half" : "Second half"} · {clock}&apos;
            </span>
          </p>
          <p className="truncate text-base font-bold sm:text-2xl">
            {awayName}
            <span className="ml-2 inline-block size-3 rounded-full align-middle" style={{ background: AWAY }} aria-hidden />
          </p>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-gold transition-[width] duration-200" style={{ width: `${(clock / 90) * 100}%` }} />
        </div>
      </section>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Pitch + key moment */}
        <section aria-label="Live pitch" className="relative overflow-hidden rounded-2xl border bg-emerald-900">
          <Pitch ball={ball} />
          {flash && !deciding && (
            <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
              <span
                key={`${flash.minute}-${flash.type}`}
                className={cn(
                  "rounded-xl bg-black/60 px-5 py-1.5 font-black uppercase tracking-widest motion-safe:animate-in motion-safe:zoom-in-75",
                  flash.type === "goal" ? "text-3xl text-gold sm:text-5xl" : "text-lg text-white",
                )}
              >
                {flash.type === "goal" ? "Goal!" : flash.type === "save" ? "Saved!" : "Chance!"}
              </span>
            </div>
          )}

          {segment && deciding && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]">
              <div className="w-full max-w-md rounded-2xl border border-gold/40 bg-slate-950/95 p-4 shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 sm:p-5" role="dialog" aria-labelledby="moment-h">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Key moment · {segment.moment.minute}&apos;</p>
                <h2 id="moment-h" className="mt-1 text-xl font-bold sm:text-2xl">{segment.moment.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{segment.moment.context}</p>
                <div className="mt-4 grid gap-2">
                  {segment.moment.options.map((o) => (
                    <Button
                      key={o.id}
                      variant="outline"
                      disabled={sending}
                      onClick={() => choose(o.id)}
                      className="h-auto justify-between gap-3 whitespace-normal py-2.5 text-left hover:border-primary hover:bg-primary/10"
                    >
                      <span className="font-semibold">{o.label}</span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">{o.hint}</span>
                    </Button>
                  ))}
                </div>
                {sending && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Playing it out…</p>}
                {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
              </div>
            </div>
          )}
          {!segment && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
              {error ? <span role="alert">{error}</span> : <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Final whistle coming up…</span>}
            </div>
          )}
        </section>

        {/* Commentary */}
        <section aria-labelledby="feed-h" className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="feed-h" className="font-semibold">Live commentary</h2>
            {!deciding && segment && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setSpeed(speed === SPEEDS[0] ? SPEEDS[1] : SPEEDS[0])} aria-label={`Speed ${speed.label}, change speed`}>
                  <FastForward className="size-3.5" /> {speed.label}
                </Button>
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => setClock(target)}>
                  <SkipForward className="size-3.5" /> Next moment
                </Button>
              </div>
            )}
          </div>
          <ol className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
            {[...visible].reverse().map((e, i) => (
              <li
                key={`${e.minute}-${e.type}-${visible.length - i}`}
                className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm motion-safe:animate-in motion-safe:fade-in", e.type === "goal" && "bg-primary/10 font-semibold")}
              >
                <span className="w-8 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{e.minute}&apos;</span>
                <span className="flex w-6 shrink-0 justify-center"><EventIcon type={e.type} /></span>
                <span className="min-w-0 flex-1">
                  {e.side && <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: e.side === "home" ? HOME : AWAY }} aria-hidden />}
                  {describe(e)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

/** A simple top-down pitch; the ball glides to where the action is. */
function Pitch({ ball }: { ball: { x: number; y: number } }) {
  return (
    <div className="relative aspect-[105/68] w-full">
      <svg viewBox="0 0 105 68" className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: 15 }, (_, i) => (
          <rect key={i} x={i * 7} y={0} width={7} height={68} fill={i % 2 ? "#136b33" : "#15763a"} />
        ))}
        <g fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={0.35}>
          <rect x={1} y={1} width={103} height={66} />
          <line x1={52.5} y1={1} x2={52.5} y2={67} />
          <circle cx={52.5} cy={34} r={9.15} />
          <rect x={1} y={13.84} width={16.5} height={40.32} />
          <rect x={87.5} y={13.84} width={16.5} height={40.32} />
          <rect x={1} y={24.84} width={5.5} height={18.32} />
          <rect x={98.5} y={24.84} width={5.5} height={18.32} />
          <rect x={-0.8} y={30.34} width={1.8} height={7.32} strokeWidth={0.5} />
          <rect x={104} y={30.34} width={1.8} height={7.32} strokeWidth={0.5} />
        </g>
        <circle cx={52.5} cy={34} r={0.4} fill="white" />
      </svg>
      <span
        aria-hidden
        className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-[left,top] duration-700 ease-out sm:size-4"
        style={{ left: `${(ball.x / 100) * 100}%`, top: `${(ball.y / 100) * 100}%` }}
      />
    </div>
  );
}
