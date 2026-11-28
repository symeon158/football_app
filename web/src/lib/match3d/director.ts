/**
 * Match "director" for the 3D view: moves 22 players and the ball and stages each match event
 * (goal, save, miss, penalty) as a short choreographed scene. It only ACTS OUT results that the
 * server already decided — it never changes them. Pure TypeScript (no rendering), so it can be
 * unit-tested; the renderer reads its state every frame.
 *
 * World: x along the length (−52.5 … 52.5, home attacks +x), z across (−34 … 34), metres.
 */

export type Side = "home" | "away";
export type Vec = { x: number; z: number };
export type Slot = { x: number; y: number }; // formation grid 0–100 (x across, y from own goal)

export type Agent = {
  side: Side;
  index: number; // 0–10 within the side (formation slot order)
  number: number;
  name: string;
  isKeeper: boolean;
  base: Vec; // formation spot with the ball at the centre spot
  pos: Vec;
  vel: Vec;
  facing: number; // radians around the vertical axis
  dive: number; // keeper dive: −1 left, 0 none, 1 right (animated by the renderer)
  celebrate: boolean;
};

export type Ball = { pos: Vec; y: number; owner: number | null; flight: Flight | null; spin: number };
type Flight = { from: Vec; to: Vec; fromY: number; toY: number; t: number; dur: number; height: number; then: "receive" | "stop" | "net" };

export type HighlightKind = "goal" | "save" | "miss" | "blocked";
export type Highlight = { kind: HighlightKind; side: Side; scorer: string | null; penalty: boolean };

export type CameraMode = "broadcast" | "shot" | "celebrate" | "replay";
export type SoundCue = "kick" | "whistle" | "whistle-long" | "roar" | "groan" | "save" | "net";

export const PITCH = { halfLength: 52.5, halfWidth: 34, goalHalf: 3.66, goalHeight: 2.44, penaltySpot: 41.5 } as const;
const dirOf = (s: Side) => (s === "home" ? 1 : -1);
const len = (x: number, z: number) => Math.sqrt(x * x + z * z);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Formation spot on the pitch (kick-off shape), mirrored for the away side. */
export function basePosition(slot: Slot, side: Side): Vec {
  const depth = slot.y / 100; // 0 = own goal … 1 = opponent goal
  const x = -PITCH.halfLength + 3 + depth * 49; // keeper ≈ −46.5, striker ≈ −8
  const z = ((slot.x - 50) / 50) * (PITCH.halfWidth - 6);
  return side === "home" ? { x, z } : { x: -x, z: -z };
}

/** Small seeded generator so a scene looks the same every time it is replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Phase =
  | { kind: "play" }
  | { kind: "scene"; h: Highlight; step: number; t: number; shooter: number; target: { x: number; y: number; z: number }; replay: boolean }
  | { kind: "celebrate"; h: Highlight; t: number; shooter: number; target: { x: number; y: number; z: number } }
  | { kind: "reset"; t: number; kickoff: Side };

export class Director {
  agents: Agent[] = [];
  ball: Ball = { pos: { x: 0, z: 0 }, y: 0.11, owner: null, flight: null, spin: 0 };
  camera: CameraMode = "broadcast";
  /** Seconds since the last goal (drives confetti); large when none. */
  sinceGoal = 999;
  /** How many scenes have reached their outcome (the screen reveals each event only then — no spoilers). */
  outcomes = 0;
  /** True while a scene, celebration or replay is playing (the match clock waits). */
  busy = false;
  possession: Side = "home";
  private phase: Phase = { kind: "play" };
  private passTimer = 1;
  private cues: SoundCue[] = [];
  private queue: Highlight[] = [];
  private r = rng(7);

  constructor(homeSlots: Slot[], awaySlots: Slot[], homeNames: string[], awayNames: string[]) {
    const make = (side: Side, slots: Slot[], names: string[]) =>
      slots.map((slot, i): Agent => {
        const base = basePosition(slot, side);
        return {
          side, index: i, number: i === 0 ? 1 : i + 1, name: names[i] ?? `Player ${i + 1}`, isKeeper: i === 0,
          base, pos: { ...base }, vel: { x: 0, z: 0 }, facing: side === "home" ? 0 : Math.PI, dive: 0, celebrate: false,
        };
      });
    this.agents = [...make("home", homeSlots, homeNames), ...make("away", awaySlots, awayNames)];
    this.kickoffShape("home");
  }

  /** Sound effects requested since the last call. */
  takeCues(): SoundCue[] {
    const c = this.cues;
    this.cues = [];
    return c;
  }

  /** Queue an event to act out (goal / save / miss…). */
  play(h: Highlight) {
    this.queue.push(h);
  }

  /** Back to kick-off shape (start of a half). */
  kickoff(side: Side) {
    this.phase = { kind: "reset", t: 0, kickoff: side };
    this.cues.push("whistle");
  }

  /** The player on the ball (for the name tag). */
  carrier(): Agent | null {
    return this.ball.owner === null ? null : this.agents[this.ball.owner];
  }

  private team(side: Side) {
    return this.agents.filter((a) => a.side === side);
  }

  private kickoffShape(side: Side) {
    for (const a of this.agents) {
      const half = a.side === "home" ? Math.min(a.base.x, -1.5) : Math.max(a.base.x, 1.5);
      a.pos = { x: half, z: a.base.z };
      a.vel = { x: 0, z: 0 };
      a.dive = 0;
      a.celebrate = false;
    }
    const taker = this.team(side).filter((a) => !a.isKeeper).sort((p, q) => Math.abs(p.pos.x) - Math.abs(q.pos.x))[0];
    taker.pos = { x: -dirOf(side) * 0.8, z: 0 };
    this.ball = { pos: { x: 0, z: 0 }, y: 0.11, owner: this.agents.indexOf(taker), flight: null, spin: 0 };
    this.possession = side;
  }

  /** Advance the simulation by `dt` seconds (already scaled for playback speed). */
  step(dt: number, possession: Side) {
    this.sinceGoal += dt;
    if (this.phase.kind === "play" && this.queue.length) this.startScene(this.queue.shift()!);
    this.busy = this.phase.kind !== "play";
    if (this.phase.kind === "play") this.possession = possession;

    switch (this.phase.kind) {
      case "play":
        this.ambient(dt);
        break;
      case "scene":
        this.scene(dt, this.phase);
        break;
      case "celebrate":
        this.celebrateStep(dt, this.phase);
        break;
      case "reset":
        this.phase.t += dt;
        this.moveAll(dt, (a) => {
          const half = a.side === "home" ? Math.min(a.base.x, -1.5) : Math.max(a.base.x, 1.5);
          return { x: half, z: a.base.z };
        }, 1.4);
        if (this.phase.t > 1.6) {
          this.kickoffShape(this.phase.kickoff);
          this.phase = { kind: "play" };
          this.camera = "broadcast";
        }
        break;
    }
    this.moveBall(dt);
    this.busy = this.phase.kind !== "play" || this.queue.length > 0;
  }

  /* ----------------------------------------------------------- open play */

  private shapeTarget(a: Agent): Vec {
    const attacking = a.side === this.possession;
    const shift = this.ball.pos.x * 0.55 + (attacking ? 7 : -3) * dirOf(a.side);
    if (a.isKeeper) {
      const gx = -dirOf(a.side) * (PITCH.halfLength - 1.5);
      return { x: gx + dirOf(a.side) * clamp(Math.abs(this.ball.pos.x - gx) * 0.06, 0, 4), z: clamp(this.ball.pos.z * 0.25, -3, 3) };
    }
    return {
      x: clamp(a.base.x + shift, -PITCH.halfLength + 4, PITCH.halfLength - 4),
      z: clamp(a.base.z + (this.ball.pos.z - a.base.z) * 0.18, -PITCH.halfWidth + 2, PITCH.halfWidth - 2),
    };
  }

  private ambient(dt: number) {
    // Make sure the side in possession has the ball.
    const owner = this.carrier();
    if (!this.ball.flight && (!owner || owner.side !== this.possession)) {
      const team = this.team(this.possession).filter((a) => !a.isKeeper);
      const nearest = team.sort((p, q) => len(p.pos.x - this.ball.pos.x, p.pos.z - this.ball.pos.z) - len(q.pos.x - this.ball.pos.x, q.pos.z - this.ball.pos.z))[0];
      this.pass(nearest, 0.7);
    }
    const carrier = this.carrier();
    const pressers = carrier
      ? this.team(carrier.side === "home" ? "away" : "home").filter((a) => !a.isKeeper)
          .sort((p, q) => len(p.pos.x - carrier.pos.x, p.pos.z - carrier.pos.z) - len(q.pos.x - carrier.pos.x, q.pos.z - carrier.pos.z))
          .slice(0, 2)
      : [];
    this.moveAll(dt, (a) => {
      if (carrier && a === carrier && !a.isKeeper) {
        // Dribble forward, staying out of the opposition box in open play.
        const d = dirOf(a.side);
        return { x: clamp(a.pos.x + d * 4, -PITCH.halfLength + 20, PITCH.halfLength - 20), z: a.pos.z + (this.r() - 0.5) * 2 };
      }
      if (carrier && pressers.includes(a)) return { x: carrier.pos.x - dirOf(carrier.side) * 2.5, z: carrier.pos.z };
      return this.shapeTarget(a);
    });
    // Keep the passes flowing.
    if (carrier && !this.ball.flight && (this.passTimer -= dt) <= 0) {
      const mates = this.team(carrier.side).filter((a) => a !== carrier && !a.isKeeper);
      const d = dirOf(carrier.side);
      const forward = mates.filter((m) => (m.pos.x - carrier.pos.x) * d > -5 && len(m.pos.x - carrier.pos.x, m.pos.z - carrier.pos.z) < 30);
      const pick = (forward.length ? forward : mates)[Math.floor(this.r() * (forward.length || mates.length))];
      if (pick) this.pass(pick, 0.6 + len(pick.pos.x - carrier.pos.x, pick.pos.z - carrier.pos.z) / 30);
      this.passTimer = 1.1 + this.r() * 1.1;
    }
  }

  /* -------------------------------------------------------------- scenes */

  private startScene(h: Highlight) {
    const d = dirOf(h.side);
    const attackers = this.team(h.side).filter((a) => !a.isKeeper);
    const named = h.scorer ? attackers.find((a) => a.name === h.scorer) : undefined;
    const shooter = named ?? [...attackers].sort((p, q) => q.base.x * d - p.base.x * d)[0];
    const r = rng(Math.floor((shooter.base.z + 100) * 1000) ^ this.agents.indexOf(shooter));
    const gx = d * PITCH.halfLength;
    const corner = r() < 0.5 ? -1 : 1;
    const target =
      h.kind === "goal"
        ? { x: gx + d * 0.6, y: 0.3 + r() * 1.7, z: corner * (1.2 + r() * 2.1) }
        : h.kind === "save"
          ? { x: gx - d * 0.9, y: 0.4 + r() * 1.3, z: corner * (0.8 + r() * 1.8) }
          : h.kind === "miss"
            ? { x: gx + d * 3, y: r() < 0.4 ? 3.4 : 0.6, z: corner * (4.6 + r() * 3) }
            : { x: gx - d * 14, y: 0.1, z: corner * 4 };
    this.phase = { kind: "scene", h, step: 0, t: 0, shooter: this.agents.indexOf(shooter), target, replay: false };
    this.possession = h.side;
    this.busy = true;
  }

  private scene(dt: number, ph: Extract<Phase, { kind: "scene" }>) {
    ph.t += dt;
    const h = ph.h;
    const d = dirOf(h.side);
    const shooter = this.agents[ph.shooter];
    const keeper = this.team(h.side === "home" ? "away" : "home").find((a) => a.isKeeper)!;
    const gx = d * PITCH.halfLength;
    const spot = h.penalty ? { x: gx - d * (PITCH.halfLength - PITCH.penaltySpot), z: 0 } : { x: gx - d * 17, z: clamp(shooter.base.z * 0.5, -12, 12) };

    if (ph.step === 0) {
      // Build-up: everyone surges forward; a quick pass into the shooter's run.
      this.camera = "broadcast";
      if (h.penalty) {
        this.moveAll(dt, (a) => (a === shooter ? spot : a === keeper ? { x: gx - d * 0.4, z: 0 } : { x: gx - d * (19 + (a.index % 4) * 2), z: ((a.index % 6) - 2.5) * 5 }), 1.6);
        if (ph.t > 1.2) {
          shooter.pos = { ...spot };
          this.ball = { ...this.ball, pos: { x: spot.x + d * 0.4, z: 0 }, owner: ph.shooter, flight: null };
          ph.step = 2;
          ph.t = 0;
          this.cues.push("whistle");
        }
        return;
      }
      this.moveAll(dt, (a) => (a === shooter ? spot : a === keeper ? { x: gx - d * 1.2, z: 0 } : this.sceneShape(a, h.side)), 1.35);
      if (ph.t > 0.25 && this.ball.owner !== ph.shooter && !this.ball.flight) this.pass(shooter, 1.0, 1.8);
      if (this.ball.owner === ph.shooter) {
        ph.step = 1;
        ph.t = 0;
      }
      return;
    }
    if (ph.step === 1) {
      // A couple of touches towards goal, the camera tightens.
      this.camera = "shot";
      this.moveAll(dt, (a) => (a === shooter ? { x: shooter.pos.x + d * 3, z: shooter.pos.z * 0.9 } : a === keeper ? { x: gx - d * 1.2, z: shooter.pos.z * 0.15 } : this.sceneShape(a, h.side)), 1.1);
      if (ph.t > 0.55) {
        ph.step = 2;
        ph.t = 0;
      }
      return;
    }
    if (ph.step === 2) {
      // The strike.
      this.camera = "shot";
      shooter.facing = Math.atan2(-(ph.target.z - shooter.pos.z), ph.target.x - shooter.pos.x);
      if (h.kind === "blocked") {
        const defender = this.team(h.side === "home" ? "away" : "home").filter((a) => !a.isKeeper)
          .sort((p, q) => len(p.pos.x - shooter.pos.x, p.pos.z - shooter.pos.z) - len(q.pos.x - shooter.pos.x, q.pos.z - shooter.pos.z))[0];
        this.pass(defender, 0.5, 0.4);
        this.cues.push("groan");
        this.outcomes++;
        this.end(ph, 1.0);
        return;
      }
      this.cues.push("kick");
      this.ball.owner = null;
      this.ball.flight = {
        from: { ...this.ball.pos }, to: { x: ph.target.x, z: ph.target.z }, fromY: 0.11, toY: ph.target.y,
        t: 0, dur: (h.penalty ? 0.45 : 0.6) * (ph.replay ? 2.6 : 1), height: ph.target.y > 2 ? 1.5 : 0.6,
        then: h.kind === "goal" ? "net" : h.kind === "save" ? "stop" : "stop",
      };
      // The keeper reads it (save) or guesses wrong (goal).
      const side = Math.sign(ph.target.z) || 1;
      keeper.dive = h.kind === "save" ? side * -d : h.kind === "goal" ? -side * -d : 0;
      ph.step = 3;
      ph.t = 0;
      return;
    }
    if (ph.step === 3) {
      // Ball in the air; the keeper flies across.
      if (h.kind === "save" || h.kind === "goal") {
        const reach = h.kind === "save" ? ph.target.z : -ph.target.z * 0.7;
        keeper.pos.z += (reach - keeper.pos.z) * Math.min(1, dt * 7);
      }
      if (!this.ball.flight) {
        if (h.kind === "goal") {
          this.cues.push("net", "roar");
          this.sinceGoal = 0;
        } else if (h.kind === "save") {
          this.ball.owner = this.agents.indexOf(keeper);
          this.cues.push("save");
        } else {
          this.cues.push("groan");
        }
        if (!ph.replay) this.outcomes++;
        ph.step = 4;
        ph.t = 0;
      }
      return;
    }
    // step 4: the moment sinks in
    if (ph.t > (h.kind === "goal" ? 0.6 : 0.9)) {
      if (h.kind === "goal") {
        if (!ph.replay) {
          this.phase = { kind: "celebrate", h, t: 0, shooter: ph.shooter, target: ph.target };
          return;
        }
        // After the replay: back to the centre circle.
        keeper.dive = 0;
        this.phase = { kind: "reset", t: 0, kickoff: h.side === "home" ? "away" : "home" };
        return;
      }
      keeper.dive = 0;
      this.end(ph, 0);
    }
  }

  private end(ph: Extract<Phase, { kind: "scene" }>, after: number) {
    if (ph.t < after) return;
    for (const a of this.agents) a.dive = 0;
    const defending: Side = ph.h.side === "home" ? "away" : "home";
    if (ph.h.kind === "save" || ph.h.kind === "miss") {
      // The keeper has it (a save) or restarts with a goal kick (a miss).
      const keeper = this.team(defending).find((a) => a.isKeeper)!;
      keeper.pos = { x: -dirOf(defending) * (PITCH.halfLength - 5), z: 0 };
      this.ball = { pos: { ...keeper.pos }, y: 0.11, owner: this.agents.indexOf(keeper), flight: null, spin: 0 };
      this.passTimer = 0.8;
    }
    this.phase = { kind: "play" };
    this.camera = "broadcast";
    this.possession = defending;
  }

  private celebrateStep(dt: number, ph: Extract<Phase, { kind: "celebrate" }>) {
    ph.t += dt;
    this.camera = "celebrate";
    const d = dirOf(ph.h.side);
    const flag = { x: d * (PITCH.halfLength - 4), z: (ph.target.z >= 0 ? 1 : -1) * (PITCH.halfWidth - 5) };
    for (const a of this.agents) a.celebrate = a.side === ph.h.side && ph.t < 2.6;
    this.moveAll(dt, (a) => (a.side === ph.h.side && !a.isKeeper ? { x: flag.x - d * (a.index % 4) * 1.4, z: flag.z - Math.sign(flag.z) * Math.floor(a.index / 4) * 1.4 } : this.shapeTarget(a)), 1.5);
    if (ph.t > 3) {
      // Slow-motion replay of the strike.
      for (const a of this.agents) a.celebrate = false;
      const shooter = this.agents[ph.shooter];
      this.camera = "replay";
      shooter.pos = { x: ph.target.x - d * 15, z: ph.target.z * 0.3 };
      this.ball = { pos: { x: shooter.pos.x + d * 0.5, z: shooter.pos.z }, y: 0.11, owner: ph.shooter, flight: null, spin: 0 };
      this.phase = { kind: "scene", h: ph.h, step: 2, t: 0, shooter: ph.shooter, target: ph.target, replay: true };
    }
  }

  private sceneShape(a: Agent, attacking: Side): Vec {
    const d = dirOf(a.side);
    const push = a.side === attacking ? 22 : 12;
    return {
      x: clamp(a.base.x + d * push * (a.side === attacking ? 1 : -0.3) + (attacking === "home" ? 8 : -8), -PITCH.halfLength + 3, PITCH.halfLength - 3),
      z: a.base.z * 0.75,
    };
  }

  /* ------------------------------------------------------------- physics */

  private moveAll(dt: number, target: (a: Agent) => Vec, pace = 1) {
    for (const a of this.agents) {
      const t = target(a);
      const dx = t.x - a.pos.x, dz = t.z - a.pos.z;
      const dist = len(dx, dz);
      const max = (a.isKeeper ? 5 : 7.5) * pace;
      const speed = Math.min(max, dist * 2.2);
      const tvx = dist > 0.05 ? (dx / dist) * speed : 0;
      const tvz = dist > 0.05 ? (dz / dist) * speed : 0;
      a.vel.x += (tvx - a.vel.x) * Math.min(1, dt * 5);
      a.vel.z += (tvz - a.vel.z) * Math.min(1, dt * 5);
      a.pos.x = clamp(a.pos.x + a.vel.x * dt, -PITCH.halfLength - 1, PITCH.halfLength + 1);
      a.pos.z = clamp(a.pos.z + a.vel.z * dt, -PITCH.halfWidth - 1, PITCH.halfWidth + 1);
      const v = len(a.vel.x, a.vel.z);
      if (v > 0.4) a.facing = Math.atan2(-a.vel.z, a.vel.x);
    }
  }

  private pass(to: Agent, dur: number, height = 0.4) {
    const from = { ...this.ball.pos };
    const lead = { x: to.pos.x + to.vel.x * dur * 0.8, z: to.pos.z + to.vel.z * dur * 0.8 };
    this.ball.owner = null;
    this.ball.flight = { from, to: lead, fromY: 0.11, toY: 0.11, t: 0, dur, height: Math.min(4, height + len(lead.x - from.x, lead.z - from.z) / 25), then: "receive" };
    this.receiver = this.agents.indexOf(to);
    this.cues.push("kick");
  }
  private receiver = -1;

  private moveBall(dt: number) {
    const b = this.ball;
    if (b.flight) {
      const f = b.flight;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      b.pos = { x: f.from.x + (f.to.x - f.from.x) * k, z: f.from.z + (f.to.z - f.from.z) * k };
      b.y = f.fromY + (f.toY - f.fromY) * k + 4 * f.height * k * (1 - k);
      b.spin += dt * 18;
      if (k >= 1) {
        b.flight = null;
        if (f.then === "receive" && this.receiver >= 0) b.owner = this.receiver;
        if (f.then === "net") {
          // Into the net: carry on a little, then drop.
          b.pos = { x: f.to.x + Math.sign(f.to.x) * 1.2, z: f.to.z * 0.95 };
          b.y = Math.max(0.11, f.toY * 0.4);
        }
      }
      return;
    }
    if (b.owner !== null) {
      const a = this.agents[b.owner];
      const ahead = a.isKeeper && this.phase.kind !== "play" ? 0 : 0.7;
      b.pos = { x: a.pos.x + Math.cos(a.facing) * ahead, z: a.pos.z - Math.sin(a.facing) * ahead };
      b.y = a.isKeeper && this.phase.kind !== "play" ? 1.1 : 0.11;
      b.spin += len(a.vel.x, a.vel.z) * dt * 3;
    }
  }
}

/** Which scene an event should become. */
export function highlightFor(e: { type: string; side: Side | null; player: string | null; detail: string | null }): Highlight | null {
  if (!e.side) return null;
  const other: Side = e.side === "home" ? "away" : "home";
  const detail = e.detail ?? "";
  if (e.type === "goal") return { kind: "goal", side: e.side, scorer: e.player, penalty: detail.includes("(pen)") };
  if (e.type === "save") {
    const m = /Denies (.+)$/.exec(detail) ?? /Saves (.+)'s penalty/.exec(detail);
    return { kind: "save", side: other, scorer: m?.[1] ?? null, penalty: detail.includes("penalty") };
  }
  if (e.type === "chance") {
    if (detail === "Pass intercepted" || detail === "Tackled") return { kind: "blocked", side: e.side, scorer: e.player, penalty: false };
    return { kind: "miss", side: e.side, scorer: e.player, penalty: detail === "Penalty missed" };
  }
  return null;
}
