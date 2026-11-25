"use client";

import { Gamepad2, Keyboard, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { PlayControls, type InputSource } from "@/lib/play/input";
import { createCamera, render } from "@/lib/play/render";
import { createMatch, minuteOf, step } from "@/lib/play/sim";
import { DT, type GoalEvent, type Phase, type PlaySetup } from "@/lib/play/types";
import { cn } from "@/lib/utils";

type Hud = {
  score: [number, number];
  minute: number;
  half: 1 | 2;
  phase: Phase;
  restart: string | null;
  goals: GoalEvent[];
  source: InputSource;
  controller: string | null;
};

const noSubscribe = () => () => {};

const CONTROLS: [string, string, string][] = [
  ["Move", "Left stick / D-pad", "WASD / arrows"],
  ["Pass", "A / ✕", "J or Space"],
  ["Shoot (hold for power)", "B / ○", "K"],
  ["Through ball", "X / □", "L"],
  ["Tackle (without the ball)", "B / ○", "K"],
  ["Switch player", "Y / △ or LB", "I or Q"],
  ["Sprint", "RT / R2", "Shift"],
  ["Pause", "Start / Options", "Esc or P"],
];

export function PlayMatch({ setup }: { setup: PlaySetup }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [hud, setHud] = useState<Hud>({ score: [0, 0], minute: 0, half: 1, phase: "kickoff", restart: null, goals: [], source: "keyboard", controller: null });
  const touchOnly = useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches,
    () => false,
  );

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const state = createMatch(setup);
    const controls = new PlayControls();
    const cam = createCamera();
    controls.attach();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = Math.min(Math.round(w * 0.56), window.innerHeight - 150);
      canvas.style.height = `${h}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0, last = performance.now(), acc = 0, hudTimer = 0;
    const frame = (now: number) => {
      const elapsed = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (controls.poll().pausePressed && state.phase !== "fulltime") setPaused((p) => !p);
      if (!pausedRef.current) {
        acc += elapsed;
        while (acc >= DT) {
          step(state, controls.take());
          acc -= DT;
        }
      } else {
        controls.take(); // drop presses made while paused
      }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      render(ctx, state, cam, canvas.width / dpr, canvas.height / dpr);
      if ((hudTimer += elapsed) > 0.1) {
        hudTimer = 0;
        setHud({
          score: [state.score[0], state.score[1]],
          minute: minuteOf(state),
          half: state.half,
          phase: state.phase,
          restart: state.restart?.kind ?? null,
          goals: state.goals.slice(),
          source: controls.lastSource,
          controller: controls.controllerName,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      controls.detach();
      window.removeEventListener("resize", resize);
    };
  }, [started, setup]);

  const [home, away] = setup.teams;

  return (
    <div className="space-y-4">
      <div ref={wrapRef} className="relative overflow-hidden rounded-2xl border bg-[#0f5a2c]">
        {/* Scoreboard */}
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
          <div className="flex items-center gap-3 rounded-xl bg-black/70 px-4 py-1.5 text-sm font-semibold text-white shadow-lg backdrop-blur">
            <span className="size-2.5 rounded-full ring-1 ring-white/60" style={{ background: home.kit.primary }} />
            <span>{home.short}</span>
            <span className="text-lg font-black tabular-nums">{hud.score[0]} – {hud.score[1]}</span>
            <span>{away.short}</span>
            <span className="size-2.5 rounded-full ring-1 ring-white/60" style={{ background: away.kit.primary }} />
            <span className="ml-1 rounded bg-white/15 px-1.5 text-xs tabular-nums">{hud.minute}&apos;</span>
          </div>
        </div>
        {hud.phase === "goal" && <Banner>GOAL!</Banner>}
        {hud.phase === "restart" && hud.restart && <Banner small>{hud.restart === "goal-kick" ? "Goal kick" : hud.restart === "corner" ? "Corner" : "Throw-in"}</Banner>}

        <canvas ref={canvasRef} className={cn("block w-full", !started && "h-[min(56vw,70vh)]")} aria-label={`${home.name} against ${away.name}`} />

        {!started && (
          <Overlay>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Play it yourself · beta</p>
            <h2 className="text-2xl font-bold sm:text-3xl">{home.name} vs {away.name}</h2>
            <p className="max-w-md text-sm text-white/75">
              Two 3-minute halves. Connect a controller (Xbox, PlayStation…) or use the keyboard.
              This prototype doesn&apos;t save results or pay coins yet.
            </p>
            {touchOnly && <p className="max-w-md rounded-lg bg-gold/20 px-3 py-2 text-sm text-gold">Phone controls are coming later — for now please use a keyboard or a controller.</p>}
            <Button size="lg" className="gap-2" onClick={() => setStarted(true)}><Play className="size-5" /> Kick off</Button>
          </Overlay>
        )}
        {started && paused && (
          <Overlay>
            <h2 className="text-2xl font-bold">Paused</h2>
            <div className="flex gap-2">
              <Button className="gap-2" onClick={() => setPaused(false)}><Play className="size-4" /> Resume</Button>
              <Link href="/matches" className={buttonVariants({ variant: "outline" })}>Quit</Link>
            </div>
          </Overlay>
        )}
        {hud.phase === "halftime" && (
          <Overlay>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Half-time</p>
            <p className="text-4xl font-black tabular-nums">{hud.score[0]} – {hud.score[1]}</p>
            <GoalList goals={hud.goals} home={home.short} away={away.short} />
            <p className="text-sm text-white/70">Second half starts in a moment…</p>
          </Overlay>
        )}
        {hud.phase === "fulltime" && (
          <Overlay>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Full time</p>
            <p className="text-2xl font-bold">
              {hud.score[0] > hud.score[1] ? "You won!" : hud.score[0] === hud.score[1] ? "A draw" : "You lost"}
            </p>
            <p className="text-5xl font-black tabular-nums">{hud.score[0]} – {hud.score[1]}</p>
            <GoalList goals={hud.goals} home={home.short} away={away.short} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="gap-2" onClick={() => window.location.reload()}><RotateCcw className="size-4" /> New match</Button>
              <Link href="/matches" className={buttonVariants({ variant: "outline" })}>Match Centre</Link>
            </div>
          </Overlay>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {hud.controller ? <Gamepad2 className="size-4 text-primary" /> : <Keyboard className="size-4" />}
          {hud.controller ? `Controller connected${hud.source === "controller" ? " (in use)" : ""}` : "Keyboard — press any button on a controller to use it"}
        </span>
        {started && hud.phase !== "fulltime" && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPaused((p) => !p)}>
            <Pause className="size-3.5" /> {paused ? "Resume" : "Pause"}
          </Button>
        )}
      </div>

      <section aria-labelledby="controls-h" className="rounded-2xl border bg-card/70 p-4">
        <h2 id="controls-h" className="mb-2 text-sm font-semibold">Controls</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-1 pr-4 font-medium">Action</th><th className="py-1 pr-4 font-medium">Controller</th><th className="py-1 font-medium">Keyboard</th></tr>
            </thead>
            <tbody className="divide-y">
              {CONTROLS.map(([a, c, k]) => (
                <tr key={a}><td className="py-1.5 pr-4">{a}</td><td className="py-1.5 pr-4 text-muted-foreground">{c}</td><td className="py-1.5 text-muted-foreground">{k}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Your players&apos; card stats matter: Pace sets running speed, Shooting sets power and accuracy, Passing sets pass accuracy,
          Defending wins tackles and Dribbling keeps the ball.
        </p>
      </section>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/65 p-4 text-center text-white backdrop-blur-sm">
      {children}
    </div>
  );
}

function Banner({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 flex justify-center">
      <span className={cn("rounded-xl bg-black/60 px-6 py-2 font-black uppercase tracking-widest text-white", small ? "text-lg" : "text-4xl text-gold sm:text-6xl")}>
        {children}
      </span>
    </div>
  );
}

function GoalList({ goals, home, away }: { goals: GoalEvent[]; home: string; away: string }) {
  if (goals.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-sm text-white/85">
      {goals.map((g, i) => (
        <li key={i}>
          <span className="font-semibold">{g.minute}&apos;</span> {g.scorer} <span className="text-white/60">({g.team === 0 ? home : away})</span>
        </li>
      ))}
    </ul>
  );
}
