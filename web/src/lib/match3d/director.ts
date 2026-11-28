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
  facing: number; // radians around the vertical axis (turns smoothly)
  dive: number; // keeper dive: −1 left, 0 none, 1 right (animated by the renderer)
  celebrate: boolean;
  /** The goalscorer during a celebration (gets the knee slide). */
  star: boolean;
  /** Seconds left of a kicking animation (pass or shot). */
  kick: number;
  /** Seconds left of a sliding tackle. */
  tackle: number;
  /** Personal rhythm so 22 players never move in lock-step. */
  seed: number;
};

export type Ball = { pos: Vec; y: number; owner: number | null; flight: Flight | null; spin: number };
type Flight = {
  from: Vec; to: Vec; fromY: number; toY: number; t: number; dur: number; height: number;
  then: "receive" | "stop" | "net";
  /** Ground passes slow down as they roll; shots fly at full speed. */
  roll: boolean;
};

export type HighlightKind = "goal" | "save" | "miss" | "blocked";
export type Highlight = { kind: HighlightKind; side: Side; scorer: string | null; penalty: boolean };

export type CameraMode = "broadcast" | "shot" | "celebrate" | "replay";
export type SoundCue = "kick" | "whistle" | "whistle-long" | "roar" | "groan" | "save" | "net";

export const PITCH = { halfLength: 52.5, halfWidth: 34, goalHalf: 3.66, goalHeight: 2.44, penaltySpot: 41.5 } as const;
export const KICK_TIME = 0.32;
export const TACKLE_TIME = 0.7;
const dirOf = (s: Side) => (s === "home" ? 1 : -1);
const other = (s: Side): Side => (s === "home" ? "away" : "home");
const len = (x: number, z: number) => Math.sqrt(x * x + z * z);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (a: Vec, b: Vec) => len(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

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

/** Scene timings (seconds of scene time). Kept short so the match flows. */
const T = { penaltyWalk: 1.0, touches: 0.4, sinkGoal: 0.45, sinkOther: 0.65, blocked: 0.8, celebrate: 2.2, celebrateEnd: 2.6, replaySlow: 2.2, reset: 1.2 };

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
  /** Scene time, for off-the-ball rhythms. */
  time = 0;
  private phase: Phase = { kind: "play" };
  private passTimer = 1;
  /** After a restart the side with the ball keeps it for a moment, whatever the feed says. */
  private grace = 0;
  private steal: { agent: number; t: number } | null = null;
  private cues: SoundCue[] = [];
  private queue: Highlight[] = [];
  private receiver = -1;
  private r = rng(7);

  constructor(homeSlots: Slot[], awaySlots: Slot[], homeNames: string[], awayNames: string[]) {
    const make = (side: Side, slots: Slot[], names: string[]) =>
      slots.map((slot, i): Agent => {
        const base = basePosition(slot, side);
        return {
          side, index: i, number: i === 0 ? 1 : i + 1, name: names[i] ?? `Player ${i + 1}`, isKeeper: i === 0,
          base, pos: { ...base }, vel: { x: 0, z: 0 }, facing: side === "home" ? 0 : Math.PI, dive: 0, celebrate: false,
          star: false, kick: 0, tackle: 0, seed: ((i + 1) * 2.399 + (side === "home" ? 0 : 1.3)) % (Math.PI * 2),
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

  /** True while the ball is flying fast (shots): the renderer draws a trail. */
  get ballFast() {
    const f = this.ball.flight;
    return Boolean(f && !f.roll && dist(f.from, f.to) / f.dur > 18);
  }

  private team(side: Side) {
    return this.agents.filter((a) => a.side === side);
  }

  private nearest(list: Agent[], p: Vec) {
    let best: Agent | null = null, bd = Infinity;
    for (const a of list) {
      const d = dist(a.pos, p);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  private kickoffShape(side: Side) {
    for (const a of this.agents) {
      const half = a.side === "home" ? Math.min(a.base.x, -1.5) : Math.max(a.base.x, 1.5);
      a.pos = { x: half, z: a.base.z };
      a.vel = { x: 0, z: 0 };
      a.facing = a.side === "home" ? 0 : Math.PI;
      a.dive = 0;
      a.celebrate = false;
      a.star = false;
      a.kick = 0;
      a.tackle = 0;
    }
    const taker = this.team(side).filter((a) => !a.isKeeper).sort((p, q) => Math.abs(p.pos.x) - Math.abs(q.pos.x))[0];
    taker.pos = { x: -dirOf(side) * 0.8, z: 0 };
    this.ball = { pos: { x: 0, z: 0 }, y: 0.11, owner: this.agents.indexOf(taker), flight: null, spin: 0 };
    this.possession = side;
    this.passTimer = 0.5;
    this.grace = 2.5;
    this.steal = null;
  }

  /** Advance the simulation by `dt` seconds (already scaled for playback speed). */
  step(dt: number, possession: Side) {
    this.sinceGoal += dt;
    this.time += dt;
    this.grace -= dt;
    for (const a of this.agents) {
      a.kick = Math.max(0, a.kick - dt);
      a.tackle = Math.max(0, a.tackle - dt);
    }
    if (this.phase.kind === "play" && this.queue.length) this.startScene(this.queue.shift()!);
    this.busy = this.phase.kind !== "play";
    if (this.phase.kind === "play" && this.grace <= 0) this.possession = possession;

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
        if (this.phase.t > T.reset) {
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

  /** Where a player wants to be off the ball: the team shape slides with the ball, attackers make runs. */
  private shapeTarget(a: Agent): Vec {
    const d = dirOf(a.side);
    const attacking = a.side === this.possession;
    const bx = this.ball.pos.x, bz = this.ball.pos.z;
    if (a.isKeeper) {
      const gx = -d * (PITCH.halfLength - 1.5);
      return { x: gx + d * clamp(Math.abs(bx - gx) * 0.07, 0, 5), z: clamp(bz * 0.22, -3, 3) };
    }
    const depth = (a.base.x * d + PITCH.halfLength) / 50; // 0.1 defender … 0.9 striker
    const shift = bx * 0.6 + (attacking ? 9 : -4) * d;
    let x = a.base.x + shift;
    let z = a.base.z + (bz - a.base.z) * (attacking ? 0.12 : 0.32); // defenders squeeze towards the ball
    if (attacking) {
      // Runs: forwards and wide players surge forward and check back in waves; full-backs overlap.
      const wave = Math.sin(this.time * 0.9 + a.seed * 3);
      x += d * (depth > 0.55 ? 5 + 6 * wave : depth < 0.3 ? 2 + 3 * Math.max(0, wave) : 3 * wave);
      z += Math.sin(this.time * 0.6 + a.seed * 5) * (depth > 0.55 ? 4 : 2);
    } else {
      // Defending: hold a compact line goal-side of the ball.
      x = Math.min(x * d, bx * d - 2 - (1 - depth) * 12) * d;
      z += Math.sin(this.time * 0.5 + a.seed) * 1.2;
    }
    return { x: clamp(x, -PITCH.halfLength + 4, PITCH.halfLength - 4), z: clamp(z, -PITCH.halfWidth + 2, PITCH.halfWidth - 2) };
  }

  private ambient(dt: number) {
    const owner = this.carrier();
    const team = this.team(this.possession).filter((a) => !a.isKeeper);

    // Winning the ball back: the nearest opponent closes down and tackles.
    if (!this.ball.flight && owner && owner.side !== this.possession) {
      if (!this.steal) this.steal = { agent: this.agents.indexOf(this.nearest(team, this.ball.pos)!), t: 0 };
    } else if (!this.ball.flight && !owner) {
      // Loose ball: the nearest player of the side in possession collects it.
      const n = this.nearest(team, this.ball.pos)!;
      if (dist(n.pos, this.ball.pos) < 1.2) this.ball.owner = this.agents.indexOf(n);
    } else {
      this.steal = null;
    }

    const carrier = this.carrier();
    const stealer = this.steal ? this.agents[this.steal.agent] : null;
    const opponents = carrier ? this.team(other(carrier.side)).filter((a) => !a.isKeeper) : [];
    const presser = carrier && !stealer ? this.nearest(opponents, carrier.pos) : null;
    const loose = !carrier && !this.ball.flight ? this.nearest(team, this.ball.pos) : null;
    const receiver = this.ball.flight && this.receiver >= 0 ? this.agents[this.receiver] : null;

    this.moveAll(dt, (a) => {
      if (a === stealer) return this.ball.pos;
      if (a === loose) return this.ball.pos;
      if (a === receiver && this.ball.flight) return this.ball.flight.to; // move to meet the pass
      if (carrier && a === carrier && !a.isKeeper) {
        // Dribble towards goal, weaving away from the nearest opponent; stay out of the box in open play.
        const d = dirOf(a.side);
        const threat = this.nearest(opponents, a.pos);
        let dz = Math.sin(this.time * 1.7 + a.seed) * 2.5;
        if (threat && dist(threat.pos, a.pos) < 7) dz += Math.sign(a.pos.z - threat.pos.z || 1) * 4;
        return { x: clamp(a.pos.x + d * 5, -PITCH.halfLength + 19, PITCH.halfLength - 19), z: clamp(a.pos.z + dz, -PITCH.halfWidth + 3, PITCH.halfWidth - 3) };
      }
      if (a === presser) return { x: carrier!.pos.x - dirOf(carrier!.side) * 2.2, z: carrier!.pos.z };
      return this.shapeTarget(a);
    }, 1, (a) => (a === stealer ? 1.45 : a === carrier ? 0.82 : a === receiver ? 1.1 : 1));

    if (this.steal && stealer && carrier) {
      this.steal.t += dt;
      const gap = dist(stealer.pos, this.ball.pos);
      if (gap < 1.4) {
        // Tackle won: a slide when coming in fast, otherwise a nip in.
        if (Math.hypot(stealer.vel.x, stealer.vel.z) > 6 || this.steal.t > 1.1) stealer.tackle = TACKLE_TIME;
        carrier.vel.x *= 0.2;
        carrier.vel.z *= 0.2;
        this.ball.owner = this.steal.agent;
        this.cues.push("kick");
        this.steal = null;
        this.passTimer = 0.9 + this.r() * 0.6;
      } else if (this.steal.t > 2.2) {
        // Couldn't catch them: the pass gets intercepted instead.
        this.pass(stealer, 0.7);
        this.steal = null;
      }
    }

    // Keep the passes flowing (not while someone is going in for the tackle).
    const c = this.carrier();
    if (c && !this.ball.flight && !this.steal && (this.passTimer -= dt) <= 0) {
      const d = dirOf(c.side);
      const mates = this.team(c.side).filter((a) => a !== c && !a.isKeeper);
      const foes = this.team(other(c.side));
      // Score each option: forward is good, being free of markers is good, very long is risky.
      let best: Agent | null = null, bestScore = -Infinity;
      for (const m of mates) {
        const range = dist(m.pos, c.pos);
        if (range < 6 || range > 38) continue;
        const marker = this.nearest(foes, m.pos)!;
        const free = Math.min(8, dist(marker.pos, m.pos));
        const score = (m.pos.x - c.pos.x) * d * 0.35 + free * 0.9 - range * 0.08 + this.r() * 3;
        if (score > bestScore) { bestScore = score; best = m; }
      }
      const pick = best ?? mates[Math.floor(this.r() * mates.length)];
      if (pick) {
        const range = dist(pick.pos, c.pos);
        const lofted = range > 26 && this.r() < 0.6;
        this.pass(pick, lofted ? 0.9 + range / 40 : 0.35 + range / 22, lofted ? 2.2 : 0.05, !lofted);
      }
      this.passTimer = (c.isKeeper ? 0.6 : 0.9) + this.r() * 1.3;
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
    this.steal = null;
    this.busy = true;
  }

  private scene(dt: number, ph: Extract<Phase, { kind: "scene" }>) {
    ph.t += dt;
    const h = ph.h;
    const d = dirOf(h.side);
    const shooter = this.agents[ph.shooter];
    const keeper = this.team(other(h.side)).find((a) => a.isKeeper)!;
    const gx = d * PITCH.halfLength;
    const spot = h.penalty ? { x: gx - d * (PITCH.halfLength - PITCH.penaltySpot), z: 0 } : { x: gx - d * 17, z: clamp(shooter.base.z * 0.5, -12, 12) };

    if (ph.step === 0) {
      // Build-up: everyone surges forward; a through ball into the shooter's run.
      this.camera = "broadcast";
      if (h.penalty) {
        this.moveAll(dt, (a) => (a === shooter ? spot : a === keeper ? { x: gx - d * 0.4, z: 0 } : { x: gx - d * (19 + (a.index % 4) * 2), z: ((a.index % 6) - 2.5) * 5 }), 1.6);
        if (ph.t > T.penaltyWalk) {
          shooter.pos = { ...spot };
          shooter.facing = d > 0 ? 0 : Math.PI;
          this.ball = { ...this.ball, pos: { x: spot.x + d * 0.5, z: 0 }, y: 0.11, owner: ph.shooter, flight: null };
          ph.step = 2;
          ph.t = 0;
          this.cues.push("whistle");
        }
        return;
      }
      this.moveAll(dt, (a) => (a === shooter ? spot : a === keeper ? { x: gx - d * 1.2, z: 0 } : this.sceneShape(a, h.side)), 1.4);
      if (ph.t > 0.2 && this.ball.owner !== ph.shooter && !this.ball.flight) this.pass(shooter, 0.85, 0.6, true);
      if (this.ball.owner === ph.shooter) {
        ph.step = 1;
        ph.t = 0;
      }
      return;
    }
    if (ph.step === 1) {
      // A touch towards goal, the camera tightens.
      this.camera = "shot";
      this.moveAll(dt, (a) => (a === shooter ? { x: shooter.pos.x + d * 3, z: shooter.pos.z * 0.9 } : a === keeper ? { x: gx - d * 1.4, z: shooter.pos.z * 0.15 } : this.sceneShape(a, h.side)), 1.15);
      if (ph.t > T.touches) {
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
        const defender = this.nearest(this.team(other(h.side)).filter((a) => !a.isKeeper), shooter.pos)!;
        defender.tackle = TACKLE_TIME;
        this.pass(defender, 0.45, 0.3);
        this.cues.push("groan");
        this.outcomes++;
        ph.step = 5;
        ph.t = 0;
        return;
      }
      this.cues.push("kick");
      shooter.kick = KICK_TIME * (ph.replay ? T.replaySlow : 1);
      this.ball.owner = null;
      this.ball.flight = {
        from: { ...this.ball.pos }, to: { x: ph.target.x, z: ph.target.z }, fromY: 0.11, toY: ph.target.y,
        t: 0, dur: (h.penalty ? 0.42 : 0.55) * (ph.replay ? T.replaySlow : 1), height: ph.target.y > 2 ? 1.5 : 0.5,
        then: h.kind === "goal" ? "net" : "stop", roll: false,
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
      this.moveAll(dt, (a) => (a === keeper ? keeper.pos : a === shooter ? shooter.pos : this.sceneShape(a, h.side)), 0.8);
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
    if (ph.step === 5) {
      // Blocked: the defender comes away with it.
      this.moveAll(dt, (a) => this.shapeTarget(a), 0.9);
      this.end(ph, T.blocked);
      return;
    }
    // step 4: the moment sinks in
    if (ph.t > (h.kind === "goal" ? T.sinkGoal : T.sinkOther)) {
      if (h.kind === "goal") {
        if (!ph.replay) {
          this.phase = { kind: "celebrate", h, t: 0, shooter: ph.shooter, target: ph.target };
          return;
        }
        // After the replay: back to the centre circle.
        keeper.dive = 0;
        this.phase = { kind: "reset", t: 0, kickoff: other(h.side) };
        return;
      }
      keeper.dive = 0;
      this.end(ph, 0);
    }
  }

  private end(ph: Extract<Phase, { kind: "scene" }>, after: number) {
    if (ph.t < after) return;
    for (const a of this.agents) a.dive = 0;
    const defending = other(ph.h.side);
    if (ph.h.kind === "save" || ph.h.kind === "miss") {
      // The keeper has it (a save) or restarts with a goal kick (a miss).
      const keeper = this.team(defending).find((a) => a.isKeeper)!;
      keeper.pos = { x: -dirOf(defending) * (PITCH.halfLength - 5), z: 0 };
      this.ball = { pos: { ...keeper.pos }, y: 0.11, owner: this.agents.indexOf(keeper), flight: null, spin: 0 };
      this.passTimer = 0.7;
    }
    this.phase = { kind: "play" };
    this.camera = "broadcast";
    this.possession = defending;
    this.grace = 2;
    this.steal = null;
  }

  private celebrateStep(dt: number, ph: Extract<Phase, { kind: "celebrate" }>) {
    ph.t += dt;
    this.camera = "celebrate";
    const d = dirOf(ph.h.side);
    const flag = { x: d * (PITCH.halfLength - 4), z: (ph.target.z >= 0 ? 1 : -1) * (PITCH.halfWidth - 5) };
    const scorer = this.agents[ph.shooter];
    for (const a of this.agents) {
      a.celebrate = a.side === ph.h.side && ph.t < T.celebrate;
      a.star = a === scorer && ph.t > 0.9 && ph.t < T.celebrate;
    }
    this.moveAll(dt, (a) => {
      if (a === scorer) return flag;
      if (a.side === ph.h.side && !a.isKeeper) {
        // Team-mates chase the scorer to the corner flag and pile around them.
        const ring = (a.index / 10) * Math.PI * 2;
        return { x: scorer.pos.x - d * (1.5 + Math.cos(ring) * 1.4), z: scorer.pos.z + Math.sin(ring) * 2 - Math.sign(flag.z) * 0.5 };
      }
      return this.shapeTarget(a);
    }, 1.5);
    if (ph.t > T.celebrateEnd) {
      // Slow-motion replay of the strike.
      for (const a of this.agents) { a.celebrate = false; a.star = false; }
      this.camera = "replay";
      scorer.pos = { x: ph.target.x - d * 15, z: ph.target.z * 0.3 };
      scorer.vel = { x: 0, z: 0 };
      const keeper = this.team(other(ph.h.side)).find((a) => a.isKeeper)!;
      keeper.pos = { x: d * (PITCH.halfLength - 1.2), z: 0 };
      this.ball = { pos: { x: scorer.pos.x + d * 0.6, z: scorer.pos.z }, y: 0.11, owner: ph.shooter, flight: null, spin: 0 };
      this.phase = { kind: "scene", h: ph.h, step: 2, t: 0, shooter: ph.shooter, target: ph.target, replay: true };
    }
  }

  private sceneShape(a: Agent, attacking: Side): Vec {
    const d = dirOf(a.side);
    const push = a.side === attacking ? 22 : 12;
    return {
      x: clamp(a.base.x + d * push * (a.side === attacking ? 1 : -0.3) + (attacking === "home" ? 8 : -8), -PITCH.halfLength + 3, PITCH.halfLength - 3),
      z: a.base.z * 0.75 + Math.sin(this.time * 0.8 + a.seed) * 1.5,
    };
  }

  /* ------------------------------------------------------------- physics */

  /**
   * Steering: each player accelerates towards their target (arriving gently), keeps a little
   * space from everyone else and turns smoothly to face where they run (or the ball when standing).
   */
  private moveAll(dt: number, target: (a: Agent) => Vec, pace = 1, boost: (a: Agent) => number = () => 1) {
    if (dt <= 0) return;
    const n = this.agents.length;
    const push = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = this.agents[i], b = this.agents[j];
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        const dd = len(dx, dz);
        if (dd < 1.8 && dd > 1e-4 && !a.celebrate && !b.celebrate) {
          const f = (1.8 - dd) * 2.2;
          push[i * 2] += (dx / dd) * f; push[i * 2 + 1] += (dz / dd) * f;
          push[j * 2] -= (dx / dd) * f; push[j * 2 + 1] -= (dz / dd) * f;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      if (a.tackle > 0) {
        // Sliding: keep gliding, slowing down.
        a.vel.x *= Math.max(0, 1 - dt * 2.5);
        a.vel.z *= Math.max(0, 1 - dt * 2.5);
      } else {
        const t = target(a);
        const dx = t.x - a.pos.x, dz = t.z - a.pos.z;
        const dd = len(dx, dz);
        const max = (a.isKeeper ? 5.5 : 8) * pace * boost(a);
        const speed = Math.min(max, dd * 1.9);
        const tvx = (dd > 0.05 ? (dx / dd) * speed : 0) + push[i * 2];
        const tvz = (dd > 0.05 ? (dz / dd) * speed : 0) + push[i * 2 + 1];
        const accel = Math.min(1, dt * 4.2);
        a.vel.x += (tvx - a.vel.x) * accel;
        a.vel.z += (tvz - a.vel.z) * accel;
      }
      a.pos.x = clamp(a.pos.x + a.vel.x * dt, -PITCH.halfLength - 1, PITCH.halfLength + 1);
      a.pos.z = clamp(a.pos.z + a.vel.z * dt, -PITCH.halfWidth - 1, PITCH.halfWidth + 1);
      if (a.kick > 0 || a.tackle > 0) continue; // keep facing the kick / slide direction
      const v = len(a.vel.x, a.vel.z);
      const want = v > 0.8 ? Math.atan2(-a.vel.z, a.vel.x) : Math.atan2(-(this.ball.pos.z - a.pos.z), this.ball.pos.x - a.pos.x);
      const turn = wrap(want - a.facing);
      const rate = (v > 0.8 ? 7 : 3.5) * dt;
      a.facing = wrap(a.facing + clamp(turn, -rate, rate));
    }
  }

  private pass(to: Agent, dur: number, height = 0.4, roll = false) {
    const from = { ...this.ball.pos };
    const kicker = this.carrier();
    if (kicker) {
      kicker.kick = KICK_TIME;
      kicker.facing = Math.atan2(-(to.pos.z - from.z), to.pos.x - from.x);
    }
    const lead = { x: to.pos.x + to.vel.x * dur * 0.8, z: to.pos.z + to.vel.z * dur * 0.8 };
    this.ball.owner = null;
    this.ball.flight = {
      from, to: lead, fromY: 0.11, toY: 0.11, t: 0, dur,
      height: roll ? 0 : Math.min(4, height + len(lead.x - from.x, lead.z - from.z) / 25), then: "receive", roll,
    };
    this.receiver = this.agents.indexOf(to);
    this.cues.push("kick");
  }

  private moveBall(dt: number) {
    const b = this.ball;
    if (b.flight) {
      const f = b.flight;
      f.t += dt;
      const lin = Math.min(1, f.t / f.dur);
      const k = f.roll ? 1 - (1 - lin) * (1 - lin) * 0.6 - (1 - lin) * 0.4 : lin; // rolling passes slow down
      const prev = { ...b.pos };
      b.pos = { x: f.from.x + (f.to.x - f.from.x) * k, z: f.from.z + (f.to.z - f.from.z) * k };
      b.y = f.fromY + (f.toY - f.fromY) * lin + 4 * f.height * lin * (1 - lin);
      b.spin += dist(prev, b.pos) * 2.6;
      if (lin >= 1) {
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
      const holding = a.isKeeper && this.phase.kind !== "play";
      // Close control: the ball is pushed ahead a touch at a time while running.
      const v = len(a.vel.x, a.vel.z);
      const ahead = holding ? 0.25 : 0.55 + (v > 1 ? 0.45 * Math.abs(Math.sin(this.time * 5 + a.seed)) : 0);
      const prev = { ...b.pos };
      const want = { x: a.pos.x + Math.cos(a.facing) * ahead, z: a.pos.z - Math.sin(a.facing) * ahead };
      const k = Math.min(1, dt * 14);
      b.pos = { x: prev.x + (want.x - prev.x) * k, z: prev.z + (want.z - prev.z) * k };
      b.y = holding ? 1.1 : 0.11;
      b.spin += dist(prev, b.pos) * 2.6;
    }
  }
}

/** Which scene an event should become. */
export function highlightFor(e: { type: string; side: Side | null; player: string | null; detail: string | null }): Highlight | null {
  if (!e.side) return null;
  const detail = e.detail ?? "";
  if (e.type === "goal") return { kind: "goal", side: e.side, scorer: e.player, penalty: detail.includes("(pen)") };
  if (e.type === "save") {
    const m = /Denies (.+)$/.exec(detail) ?? /Saves (.+)'s penalty/.exec(detail);
    return { kind: "save", side: other(e.side), scorer: m?.[1] ?? null, penalty: detail.includes("penalty") };
  }
  if (e.type === "chance") {
    if (detail === "Pass intercepted" || detail === "Tackled") return { kind: "blocked", side: e.side, scorer: e.player, penalty: false };
    return { kind: "miss", side: e.side, scorer: e.player, penalty: detail === "Penalty missed" };
  }
  return null;
}
