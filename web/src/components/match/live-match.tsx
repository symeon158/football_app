"use client";

import { FastForward, Loader2, Megaphone, Pause, Play, Repeat2, SkipForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { advanceMatch, decideMoment, giveOrder, resumeMatch, type MomentResult, type OrderInput } from "@/app/(game)/matches/actions";
import { SERIES_COLORS } from "@/components/players/series-colors";
import { Button } from "@/components/ui/button";
import type { LiveEvent, LiveSegment } from "@/lib/engine/live";
import { cn } from "@/lib/utils";

import { describe, EventIcon } from "./match-viewer";

const HOME = SERIES_COLORS[0];
const AWAY = SERIES_COLORS[1];
const SPEEDS = [{ label: "1×", ms: 320 }, { label: "3×", ms: 110 }] as const;
const CHUNK = 3; // minutes the server reveals per request

type Slot = { x: number; y: number };
type Scouting = {
  formation: string;
  tactic: string;
  players: { name: string; position: string; overall: number }[];
  homeSlots: Slot[];
  awaySlots: Slot[];
} | null;

type Props = {
  matchId: string;
  homeName: string;
  awayName: string;
  initial: LiveSegment | null;
  needsFinish: boolean;
  matchday: boolean;
  scouting: Scouting;
};

const TACTICS = [
  { value: "defensive", label: "Defensive" },
  { value: "balanced", label: "Balanced" },
  { value: "attacking", label: "Attacking" },
] as const;

/** A small deterministic wobble so the ball doesn't sit still. */
const wobble = (n: number, range: number) => ((n * 37) % 100) / 100 * range;

export function LiveMatch({ matchId, homeName, awayName, initial, needsFinish, matchday, scouting }: Props) {
  const router = useRouter();
  const [seg, setSeg] = useState<LiveSegment | null>(initial);
  const fresh = Boolean(initial && initial.minute === 0 && !initial.moment);
  const [clock, setClock] = useState(initial ? (fresh ? 0 : initial.minute) : 0);
  const [started, setStarted] = useState(!fresh);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(SPEEDS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [subOff, setSubOff] = useState<string | null>(null);
  const [subOn, setSubOn] = useState<string | null>(null);
  const fetching = useRef(false);

  const deciding = Boolean(seg?.moment) && clock >= (seg?.moment?.minute ?? 0);
  const visible = useMemo(() => (seg?.events ?? []).filter((e) => e.minute <= clock || e.type === "kickoff"), [seg, clock]);
  const score = visible.reduce((s, e) => (e.type === "goal" && e.side ? { ...s, [e.side]: s[e.side] + 1 } : s), { home: 0, away: 0 });
  const last = visible.at(-1);
  const flash = last && last.minute >= clock - 1 && ["goal", "save", "chance"].includes(last.type) ? last : null;
  const running = started && !paused && !deciding && Boolean(seg);

  // Keep coins/level in the top bar hidden until full time.
  useEffect(() => {
    document.documentElement.dataset.matchLive = "1";
    return () => {
      delete document.documentElement.dataset.matchLive;
    };
  }, []);

  const handle = (r: MomentResult, minute: number) => {
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (r.done || !r.segment) {
      router.replace(`/matches/${matchId}?live=1&from=${minute}`);
      return;
    }
    setError(null);
    setSeg(r.segment);
  };

  // Everything decided (e.g. after a dropped connection): settle and show the result.
  useEffect(() => {
    if (!needsFinish) return;
    startBusy(async () => handle(await resumeMatch(matchId), 80));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFinish, matchId]);

  // The clock: one minute per tick, up to what the server has revealed.
  useEffect(() => {
    if (!running || !seg) return;
    const t = setInterval(() => setClock((c) => (c < seg.minute ? c + 1 : c)), speed.ms);
    return () => clearInterval(t);
  }, [running, seg, speed]);

  // Caught up with the server: ask it to reveal the next few minutes (retrying if the network drops).
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!running || !seg || seg.moment || clock < seg.minute || fetching.current) return;
    fetching.current = true;
    const from = clock;
    advanceMatch(matchId, seg.minute >= 90 ? 90 : seg.minute + CHUNK)
      .then((r) => handle(r, from))
      .catch(() => {
        setError("Connection lost — retrying…");
        setTimeout(() => setRetry((n) => n + 1), 2000);
      })
      .finally(() => {
        fetching.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, seg, clock, matchId, retry]);

  const choose = (choice: string) => {
    if (!seg?.moment) return;
    const minute = seg.moment.minute;
    startBusy(async () => handle(await decideMoment(matchId, seg.moment!.index, choice), minute));
  };
  const order = (o: OrderInput) => {
    const minute = clock;
    startBusy(async () => {
      handle(await giveOrder(matchId, o), minute);
      setSubOff(null);
      setSubOn(null);
    });
  };

  // Ball and player positions for the 2D view.
  const ball = useMemo(() => {
    if (seg?.moment && deciding && (seg.moment.kind === "chance" || seg.moment.kind === "penalty")) return { x: seg.moment.kind === "penalty" ? 89 : 84, y: 50 };
    if (last && last.minute >= clock - 1) {
      if (last.type === "goal") return { x: last.side === "home" ? 99 : 1, y: 50 };
      if (last.type === "chance") return { x: last.side === "home" ? 86 : 14, y: 40 };
      if (last.type === "save") return { x: last.side === "home" ? 8 : 92, y: 52 };
    }
    if (!started || clock === 0 || last?.type === "half_time") return { x: 50, y: 50 };
    const poss = [...(seg?.possession ?? [])].reverse().find((p) => p.minute <= clock);
    const base = poss?.side === "home" ? 58 : 22;
    return { x: base + wobble(clock, 22), y: 22 + wobble(clock * 3 + 7, 56) };
  }, [seg, deciding, last, clock, started]);

  const h = seg?.home;
  const shoutReady = h ? (seg?.minute ?? 0) >= h.shoutReadyAt : false;
  const controlsDisabled = !started || busy || deciding || !seg || seg.minute >= 90;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Scoreboard */}
      <section aria-label="Scoreboard" className="rounded-3xl border bg-gradient-to-b from-slate-900 to-emerald-950/70 p-4 sm:p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <p className="truncate text-right text-base font-bold sm:text-2xl">
            <span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: HOME }} aria-hidden />
            {homeName}
          </p>
          <p className="text-center" aria-live="polite">
            <span key={`${score.home}-${score.away}`} className="block text-4xl font-black tabular-nums motion-safe:animate-in motion-safe:zoom-in-90 sm:text-5xl">
              {score.home} – {score.away}
            </span>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-widest text-gold">
              {!started ? "Pre-match" : `${clock <= 45 ? "First half" : "Second half"} · ${clock}'`}
            </span>
          </p>
          <p className="truncate text-base font-bold sm:text-2xl">
            {awayName}
            <span className="ml-2 inline-block size-3 rounded-full align-middle" style={{ background: AWAY }} aria-hidden />
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${(clock / 90) * 100}%` }} />
        </div>
      </section>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4 sm:space-y-6">
          {/* Pitch */}
          <section aria-label="Live pitch" className="relative overflow-hidden rounded-2xl border bg-emerald-900">
            <Pitch ball={ball} homeSlots={scouting?.homeSlots ?? []} awaySlots={scouting?.awaySlots ?? []} />
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

            {!started && seg && (
              <Overlay>
                <PreMatch homeName={homeName} awayName={awayName} scouting={scouting} xi={seg.home.onPitch} onStart={() => setStarted(true)} />
              </Overlay>
            )}

            {seg?.moment && deciding && (
              <Overlay>
                <div className="w-full max-w-md rounded-2xl border border-gold/40 bg-slate-950/95 p-4 shadow-2xl motion-safe:animate-in motion-safe:zoom-in-95 sm:p-5" role="dialog" aria-labelledby="moment-h">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Key moment · {seg.moment.minute}&apos;</p>
                  <h2 id="moment-h" className="mt-1 text-xl font-bold sm:text-2xl">{seg.moment.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{seg.moment.context}</p>
                  <div className="mt-4 grid gap-2">
                    {seg.moment.options.map((o) => (
                      <Button key={o.id} variant="outline" disabled={busy} onClick={() => choose(o.id)}
                        className="h-auto justify-between gap-3 whitespace-normal py-2.5 text-left hover:border-primary hover:bg-primary/10">
                        <span className="font-semibold">{o.label}</span>
                        <span className="shrink-0 text-xs font-normal text-muted-foreground">{o.hint}</span>
                      </Button>
                    ))}
                  </div>
                  {busy && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Playing it out…</p>}
                  {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
                </div>
              </Overlay>
            )}
            {!seg && (
              <Overlay>
                {error ? <span role="alert">{error}</span> : <span className="flex items-center gap-2 text-white"><Loader2 className="size-4 animate-spin" /> Final whistle coming up…</span>}
              </Overlay>
            )}
          </section>

          {/* Playback controls */}
          {started && seg && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPaused((p) => !p)} disabled={deciding}>
                {paused ? <><Play className="size-3.5" /> Resume</> : <><Pause className="size-3.5" /> Pause</>}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSpeed(speed === SPEEDS[0] ? SPEEDS[1] : SPEEDS[0])} aria-label={`Speed ${speed.label}, change speed`}>
                <FastForward className="size-3.5" /> {speed.label}
              </Button>
              {!matchday && (
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setClock(seg.moment?.minute ?? seg.minute)}>
                  <SkipForward className="size-3.5" /> Next moment
                </Button>
              )}
              {error && !deciding && <span role="alert" className="text-sm text-destructive">{error}</span>}
            </div>
          )}
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Touchline */}
          {matchday && h && (
            <section aria-labelledby="touchline-h" className="rounded-2xl border bg-card/70 p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 id="touchline-h" className="font-semibold">Touchline</h2>
                <span className="text-xs text-muted-foreground">{started ? `Changes apply from ${Math.min(90, (seg?.minute ?? 0) + 1)}'` : "Start the match to give instructions"}</span>
              </div>

              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tactic</p>
              <div className="grid grid-cols-3 gap-1.5">
                {TACTICS.map((t) => (
                  <Button key={t.value} size="sm" variant={h.tactic === t.value ? "default" : "outline"} disabled={controlsDisabled || h.tactic === t.value}
                    onClick={() => order({ kind: "tactic", value: t.value })}>
                    {t.label}
                  </Button>
                ))}
              </div>

              <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">
                Shouts {h.shout ? <span className="text-gold">· “{h.shout.value === "press" ? "Press high" : "Keep the ball"}” until {h.shout.until}&apos;</span> : !shoutReady && started ? `· ready at ${h.shoutReadyAt}'` : ""}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={controlsDisabled || !shoutReady} onClick={() => order({ kind: "shout", value: "press" })} title="More pressure and chances for 10 minutes — tires your players faster">
                  <Megaphone className="size-3.5" /> Press high
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={controlsDisabled || !shoutReady} onClick={() => order({ kind: "shout", value: "possession" })} title="Control midfield and sit tighter for 10 minutes">
                  <Megaphone className="size-3.5" /> Keep the ball
                </Button>
              </div>

              <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">Substitutions · {h.subsLeft} left</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <ul className="space-y-1" aria-label="On the pitch">
                  {[...h.onPitch].sort((a, b) => a.stamina - b.stamina).map((p) => (
                    <li key={p.id ?? p.name}>
                      <button type="button" disabled={controlsDisabled || !p.id || h.subsLeft <= 0} onClick={() => setSubOff(p.id)}
                        className={cn("w-full rounded-lg border px-2 py-1 text-left text-xs transition disabled:opacity-60", subOff === p.id ? "border-destructive bg-destructive/10" : "hover:bg-muted/50")}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate"><span className="font-semibold text-muted-foreground">{p.position}</span> {p.name}{p.yellow && " 🟨"}</span>
                          <span className="tabular-nums">{p.overall}</span>
                        </span>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted" aria-label={`Stamina ${p.stamina}%`}>
                          <span className={cn("block h-full rounded-full", p.stamina > 70 ? "bg-primary" : p.stamina > 50 ? "bg-gold" : "bg-destructive")} style={{ width: `${p.stamina}%` }} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div>
                  <ul className="space-y-1" aria-label="Bench">
                    {h.bench.length === 0 && <li className="text-xs text-muted-foreground">No substitutes on the bench.</li>}
                    {h.bench.map((b) => (
                      <li key={b.id ?? b.name}>
                        <button type="button" disabled={controlsDisabled || !b.id || h.subsLeft <= 0} onClick={() => setSubOn(b.id)}
                          className={cn("w-full rounded-lg border px-2 py-1.5 text-left text-xs transition disabled:opacity-60", subOn === b.id ? "border-primary bg-primary/10" : "hover:bg-muted/50")}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate"><span className="font-semibold text-muted-foreground">{b.position}</span> {b.name}</span>
                            <span className="tabular-nums">{b.overall}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" className="mt-2 w-full gap-1.5" disabled={controlsDisabled || !subOff || !subOn}
                    onClick={() => subOff && subOn && order({ kind: "sub", off: subOff, on: subOn })}>
                    <Repeat2 className="size-3.5" /> Make substitution
                  </Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">Pick a tired player, then a substitute.</p>
                </div>
              </div>
            </section>
          )}

          {/* Commentary */}
          <section aria-labelledby="feed-h" className="rounded-2xl border bg-card/70 p-4 backdrop-blur">
            <h2 id="feed-h" className="mb-3 font-semibold">Live commentary</h2>
            <ol className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
              {[...visible].reverse().map((e: LiveEvent, i) => (
                <li key={`${e.minute}-${e.type}-${visible.length - i}`}
                  className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm motion-safe:animate-in motion-safe:fade-in", e.type === "goal" && "bg-primary/10 font-semibold")}>
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
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]">{children}</div>;
}

function PreMatch({ homeName, awayName, scouting, xi, onStart }: {
  homeName: string;
  awayName: string;
  scouting: Scouting;
  xi: { name: string; position: string; overall: number }[];
  onStart: () => void;
}) {
  const danger = scouting ? [...scouting.players].sort((a, b) => b.overall - a.overall).slice(0, 3) : [];
  const avg = (ps: { overall: number }[]) => (ps.length ? Math.round(ps.reduce((s, p) => s + p.overall, 0) / ps.length) : 0);
  return (
    <div className="w-full max-w-lg rounded-2xl border bg-slate-950/95 p-4 text-sm shadow-2xl sm:p-5" role="dialog" aria-labelledby="prematch-h">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pre-match</p>
      <h2 id="prematch-h" className="mt-1 text-xl font-bold">{homeName} vs {awayName}</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Scouting report</p>
          {scouting ? (
            <>
              <p className="mt-1">{scouting.formation} · <span className="capitalize">{scouting.tactic}</span> · avg {avg(scouting.players)}</p>
              <p className="mt-2 text-xs text-muted-foreground">Players to watch</p>
              <ul className="mt-1 space-y-0.5">
                {danger.map((p) => <li key={p.name} className="flex justify-between gap-2"><span className="truncate">{p.position} {p.name}</span><span className="font-semibold tabular-nums">{p.overall}</span></li>)}
              </ul>
            </>
          ) : <p className="mt-1 text-muted-foreground">No report available.</p>}
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Your XI · avg {avg(xi)}</p>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {xi.map((p) => <li key={p.name} className="flex justify-between gap-2"><span className="truncate">{p.position} {p.name}</span><span className="tabular-nums text-muted-foreground">{p.overall}</span></li>)}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">From the touchline you can change tactics, shout instructions and make up to 5 substitutions. Big moments are your call.</p>
      <Button className="mt-4 w-full gap-2" onClick={onStart}><Play className="size-4" /> Start match</Button>
    </div>
  );
}

/** Top-down pitch: both teams hold their formation shape and shift with the ball. */
function Pitch({ ball, homeSlots, awaySlots }: { ball: { x: number; y: number }; homeSlots: Slot[]; awaySlots: Slot[] }) {
  const shift = (ball.x - 50) * 0.35;
  const dot = (s: Slot, side: "home" | "away") => {
    const depth = 3 + s.y * 0.44; // 0–100 from own goal → % of the pitch length (own half and beyond)
    const left = side === "home" ? depth + shift : 100 - depth + shift;
    const top = side === "home" ? s.x : 100 - s.x;
    return { left: `${Math.max(1.5, Math.min(98.5, left))}%`, top: `${6 + top * 0.88}%` };
  };
  return (
    <div className="relative aspect-[105/68] w-full">
      <svg viewBox="0 0 105 68" className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: 15 }, (_, i) => <rect key={i} x={i * 7} y={0} width={7} height={68} fill={i % 2 ? "#136b33" : "#15763a"} />)}
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
      </svg>
      {homeSlots.map((s, i) => (
        <span key={`h${i}`} aria-hidden className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 transition-[left,top] duration-1000 ease-in-out sm:size-3.5" style={{ ...dot(s, "home"), background: HOME }} />
      ))}
      {awaySlots.map((s, i) => (
        <span key={`a${i}`} aria-hidden className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/60 transition-[left,top] duration-1000 ease-in-out sm:size-3.5" style={{ ...dot(s, "away"), background: AWAY }} />
      ))}
      <span aria-hidden className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-[left,top] duration-700 ease-out sm:size-3.5"
        style={{ left: `${ball.x}%`, top: `${ball.y}%` }} />
    </div>
  );
}
