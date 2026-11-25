/**
 * Playable match simulation. Pure and deterministic: the same setup (seed) and the same
 * sequence of inputs always produce the same match. It advances in fixed ticks (DT), draws
 * randomness only from the seeded generator in the state, and avoids trigonometry
 * (only + − × ÷ and sqrt, which are exact in every JavaScript engine) — so a later server
 * can replay a recorded input log and verify the score.
 */
import { DT, HALF_SECONDS, PITCH, type MatchState, type PlayerState, type PlayInput, type PlaySetup, type TeamIndex } from "./types";

const L = PITCH.length;
const W = PITCH.width;
const GOAL_HALF = PITCH.goalWidth / 2;

const ACCEL = 18; // m/s²
const BALL_DRAG = 0.9; // proportional, per second
const BALL_DECEL = 1.6; // constant, m/s²
const DRIBBLE_OFFSET = 0.75;
const TACKLE_RANGE = 1.7;
const KICKOFF_SECONDS = 1.5;
const GOAL_SECONDS = 2.5;
const RESTART_SECONDS = 1.1;
const HALFTIME_SECONDS = 4;

/* ------------------------------------------------------------------ helpers */

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dirOf = (t: TeamIndex) => (t === 0 ? 1 : -1); // attacking direction along x
const oppGoalX = (t: TeamIndex) => (t === 0 ? L : 0);
const ownGoalX = (t: TeamIndex) => (t === 0 ? 0 : L);

/** mulberry32 over the state's rngState (kept in the state so it replays exactly). */
function rand(s: MatchState): number {
  let t = (s.rngState = (s.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randSigned = (s: MatchState) => rand(s) * 2 - 1;

const runSpeed = (p: PlayerState) => 5 + p.stats.pace * 0.036;
const isKeeper = (p: PlayerState) => p.role === "GK";
const teamOf = (s: MatchState, t: TeamIndex) => s.players.filter((p) => p.team === t);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => len(a.x - b.x, a.y - b.y);

export function minuteOf(s: MatchState): number {
  return Math.min(45, Math.floor((s.clock / HALF_SECONDS) * 45)) + (s.half === 2 ? 45 : 0);
}

/* ------------------------------------------------------------------- set-up */

export function createMatch(setup: PlaySetup): MatchState {
  const players: PlayerState[] = [];
  setup.teams.forEach((team, t) => {
    team.players.forEach((pl, i) => {
      const depth = pl.slotY / 100; // 0 = own goal, 1 = opponent goal
      const across = (pl.slotX - 50) / 50; // -1 = left, +1 = right (from the team's view)
      const bx = 2 + depth * (L * 0.5 - 4);
      const by = W / 2 + across * (W / 2 - 5);
      players.push({
        id: t * 11 + i,
        team: t as TeamIndex,
        role: pl.role,
        name: pl.name,
        stats: pl.stats,
        baseX: t === 0 ? bx : L - bx,
        baseY: t === 0 ? by : W - by, // facing the other way, their left is our right
        x: 0, y: 0, vx: 0, vy: 0,
        fx: t === 0 ? 1 : -1, fy: 0,
        stun: 0, kickCooldown: 0, tackleCooldown: 0, decision: 0,
      });
    });
  });
  const s: MatchState = {
    tick: 0, half: 1, clock: 0, phase: "kickoff", phaseTimer: KICKOFF_SECONDS, kickoffTeam: 0,
    restart: null, score: [0, 0], goals: [], players,
    ball: { x: L / 2, y: W / 2, vx: 0, vy: 0, owner: null, lastTouch: null, lastKicker: null, intendedFor: null },
    controlled: 0, charge: 0, shootWasHeld: false, rngState: setup.seed >>> 0, setup,
  };
  setupKickoff(s, 0);
  return s;
}

function setupKickoff(s: MatchState, team: TeamIndex) {
  s.phase = "kickoff";
  s.phaseTimer = KICKOFF_SECONDS;
  s.kickoffTeam = team;
  s.restart = null;
  s.charge = 0;
  Object.assign(s.ball, { x: L / 2, y: W / 2, vx: 0, vy: 0, owner: null, intendedFor: null });
  for (const p of s.players) {
    const half = p.team === 0 ? clamp(p.baseX, 1, L / 2 - 1.5) : clamp(p.baseX, L / 2 + 1.5, L - 1);
    Object.assign(p, { x: half, y: p.baseY, vx: 0, vy: 0, fx: dirOf(p.team), fy: 0, stun: 0, kickCooldown: 0, tackleCooldown: 0, decision: 0.6 });
  }
  // The kicking team's most advanced player stands on the ball.
  const taker = teamOf(s, team).filter((p) => !isKeeper(p)).sort((a, b) => dist(a, s.ball) - dist(b, s.ball))[0];
  taker.x = L / 2 - dirOf(team) * 0.8;
  taker.y = W / 2;
  s.controlled = nearestHome(s, s.ball, null)?.id ?? 1;
}

function nearestHome(s: MatchState, at: { x: number; y: number }, exclude: number | null) {
  let best: PlayerState | null = null;
  for (const p of s.players) {
    if (p.team !== 0 || isKeeper(p) || p.id === exclude) continue;
    if (!best || dist(p, at) < dist(best, at)) best = p;
  }
  return best;
}

/* --------------------------------------------------------------------- step */

/** Advances the match by one tick (DT seconds). Mutates and returns the state. */
export function step(s: MatchState, input: PlayInput): MatchState {
  s.tick++;
  switch (s.phase) {
    case "fulltime":
      return s;
    case "halftime":
      if ((s.phaseTimer -= DT) <= 0) {
        s.half = 2;
        s.clock = 0;
        setupKickoff(s, 1);
      }
      return s;
    case "kickoff":
      if ((s.phaseTimer -= DT) <= 0) {
        const taker = teamOf(s, s.kickoffTeam).filter((p) => !isKeeper(p)).sort((a, b) => dist(a, s.ball) - dist(b, s.ball))[0];
        giveBall(s, taker);
        taker.decision = 0.4;
        s.phase = "play";
      }
      return s;
    case "goal":
      moveBallFree(s);
      s.ball.x = clamp(s.ball.x, -PITCH.goalDepth + 0.3, L + PITCH.goalDepth - 0.3); // stays in the net
      s.ball.y = clamp(s.ball.y, W / 2 - GOAL_HALF + 0.3, W / 2 + GOAL_HALF - 0.3);
      if ((s.phaseTimer -= DT) <= 0) setupKickoff(s, s.kickoffTeam);
      return s;
    case "restart":
      s.clock += DT;
      updatePlayers(s, input, true);
      if ((s.phaseTimer -= DT) <= 0 && s.restart) {
        const r = s.restart;
        const takers = teamOf(s, r.team).filter((p) => (r.kind === "goal-kick" ? isKeeper(p) : !isKeeper(p)));
        const taker = takers.sort((a, b) => dist(a, r) - dist(b, r))[0];
        taker.x = clamp(r.x, 0.3, L - 0.3) - dirOf(r.team) * 0.6;
        taker.y = clamp(r.y, 0.3, W - 0.3);
        Object.assign(s.ball, { x: r.x, y: r.y, vx: 0, vy: 0 });
        giveBall(s, taker);
        taker.decision = 0.5;
        s.restart = null;
        s.phase = "play";
      }
      checkClock(s);
      return s;
    case "play":
      s.clock += DT;
      updatePlayers(s, input, false);
      updateBall(s);
      checkClock(s);
      return s;
  }
}

function checkClock(s: MatchState) {
  if (s.clock < HALF_SECONDS || (s.phase !== "play" && s.phase !== "restart")) return;
  s.ball.owner = null;
  s.charge = 0;
  if (s.half === 1) {
    s.phase = "halftime";
    s.phaseTimer = HALFTIME_SECONDS;
  } else {
    s.phase = "fulltime";
  }
}

function giveBall(s: MatchState, p: PlayerState) {
  s.ball.owner = p.id;
  s.ball.vx = 0;
  s.ball.vy = 0;
  s.ball.lastTouch = p.team;
  s.ball.intendedFor = null;
  if (p.team === 0 && !isKeeper(p)) s.controlled = p.id;
}

/* ------------------------------------------------------------------ players */

function updatePlayers(s: MatchState, input: PlayInput, restart: boolean) {
  for (const p of s.players) {
    p.stun = Math.max(0, p.stun - DT);
    p.kickCooldown = Math.max(0, p.kickCooldown - DT);
    p.tackleCooldown = Math.max(0, p.tackleCooldown - DT);
  }
  for (const p of s.players) {
    if (p.id === s.controlled) human(s, p, input, restart);
    else if (isKeeper(p)) keeper(s, p, restart);
    else ai(s, p, restart);
  }
  // Keep players apart.
  for (let i = 0; i < s.players.length; i++) {
    for (let j = i + 1; j < s.players.length; j++) {
      const a = s.players[i], b = s.players[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = len(dx, dy);
      if (d > 0.0001 && d < 1.1) {
        const push = (1.1 - d) / 2;
        a.x -= (dx / d) * push; a.y -= (dy / d) * push;
        b.x += (dx / d) * push; b.y += (dy / d) * push;
      }
    }
  }
  s.shootWasHeld = input.shootHeld;
}

/** Accelerates a player towards a desired velocity and moves them. */
function drive(p: PlayerState, dvx: number, dvy: number) {
  if (p.stun > 0) { dvx = 0; dvy = 0; }
  let ax = dvx - p.vx, ay = dvy - p.vy;
  const a = len(ax, ay), max = ACCEL * DT;
  if (a > max) { ax = (ax / a) * max; ay = (ay / a) * max; }
  p.vx += ax; p.vy += ay;
  p.x = clamp(p.x + p.vx * DT, -1.5, L + 1.5);
  p.y = clamp(p.y + p.vy * DT, -1.5, W + 1.5);
  const v = len(p.vx, p.vy);
  if (v > 0.4) { p.fx = p.vx / v; p.fy = p.vy / v; }
}

function moveTo(p: PlayerState, tx: number, ty: number, factor = 1) {
  const dx = tx - p.x, dy = ty - p.y, d = len(dx, dy);
  if (d < 0.25) return drive(p, 0, 0);
  const speed = runSpeed(p) * factor * Math.min(1, d / 2.5); // ease in to the spot
  drive(p, (dx / d) * speed, (dy / d) * speed);
}

function human(s: MatchState, p: PlayerState, input: PlayInput, restart: boolean) {
  const hasBall = s.ball.owner === p.id;
  let mx = input.moveX, my = input.moveY;
  const m = len(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  const speed = runSpeed(p) * (input.sprint ? 1.22 : 1) * (hasBall ? 0.9 : 1);
  drive(p, mx * speed, my * speed);
  const mm = len(mx, my);
  if (mm > 0.2) { p.fx = mx / mm; p.fy = my / mm; } // turn instantly to the stick
  if (restart) return;

  if (input.switchPlayer) {
    const next = nearestHome(s, s.ball, p.id);
    if (next) s.controlled = next.id;
    s.charge = 0;
    return;
  }
  if (hasBall) {
    const aimX = m > 0.2 ? mx : p.fx, aimY = m > 0.2 ? my : p.fy;
    if (input.pass) return pass(s, p, aimX, aimY, false);
    if (input.through) return pass(s, p, aimX, aimY, true);
    if (input.shootHeld) s.charge = Math.min(1, s.charge + DT);
    else if (s.shootWasHeld && s.charge > 0) {
      shoot(s, p, s.charge, my);
      s.charge = 0;
    }
  } else {
    s.charge = 0;
    if (input.shootHeld && !s.shootWasHeld) tackle(s, p);
    else if (input.pass) {
      const next = nearestHome(s, s.ball, p.id);
      if (next && dist(next, s.ball) < dist(p, s.ball)) s.controlled = next.id;
    }
  }
}

/** Where an outfield player should stand given the ball's position. */
function shapeTarget(s: MatchState, p: PlayerState) {
  const attacking = s.ball.owner !== null ? s.players[s.ball.owner].team === p.team : s.ball.lastTouch === p.team;
  const push = attacking ? 7 * dirOf(p.team) : -2 * dirOf(p.team);
  const tx = clamp(p.baseX + (s.ball.x - L / 2) * 0.55 + push, 3, L - 3);
  const ty = clamp(p.baseY + (s.ball.y - W / 2) * 0.3, 2, W - 2);
  return { tx, ty };
}

function ai(s: MatchState, p: PlayerState, restart: boolean) {
  const ball = s.ball;
  if (restart) {
    const { tx, ty } = shapeTarget(s, p);
    return moveTo(p, tx, ty, 0.8);
  }
  // With the ball (computer team only: the human's players get control when they receive it).
  if (ball.owner === p.id) return carry(s, p);

  const owner = ball.owner !== null ? s.players[ball.owner] : null;
  const mates = teamOf(s, p.team).filter((q) => !isKeeper(q));

  // A pass is coming to me: run onto it.
  if (ball.owner === null && ball.intendedFor === p.id) {
    return moveTo(p, ball.x + ball.vx * 0.25, ball.y + ball.vy * 0.25, 1.05);
  }

  if (!owner || owner.team !== p.team) {
    // Ball loose or with the opponent: the nearest players go for it.
    const ranked = mates.filter((q) => q.id !== s.controlled).sort((a, b) => dist(a, ball) - dist(b, ball));
    const humanDist = p.team === 0 ? dist(s.players[s.controlled], ball) : Infinity;
    const rank = ranked.indexOf(p);
    const chase = p.team === 1 ? rank === 0 : rank === 0 && dist(p, ball) < humanDist - 3;
    const support = p.team === 1 && rank === 1 && owner !== null;
    if (chase) {
      moveTo(p, ball.x, ball.y, owner ? 1 : 1.05);
      if (owner && dist(p, owner) < TACKLE_RANGE && p.tackleCooldown <= 0 && rand(s) < 0.035) tackle(s, p);
      return;
    }
    if (support) {
      // Cut the route between the ball and our goal.
      const gx = ownGoalX(p.team);
      return moveTo(p, ball.x + (gx - ball.x) * 0.25, ball.y + (W / 2 - ball.y) * 0.25, 0.95);
    }
  }
  const { tx, ty } = shapeTarget(s, p);
  moveTo(p, tx, ty, 0.85);
}

/** Computer player on the ball: dribble, pass or shoot. */
function carry(s: MatchState, p: PlayerState) {
  const gx = oppGoalX(p.team), d = dirOf(p.team);
  const goalDist = len(gx - p.x, W / 2 - p.y);
  const opponents = teamOf(s, (1 - p.team) as TeamIndex);
  const nearest = opponents.reduce((a, b) => (dist(a, p) < dist(b, p) ? a : b));
  const pressure = dist(nearest, p);

  if (isKeeper(p)) {
    drive(p, 0, 0);
    if ((p.decision -= DT) <= 0) {
      const mates = teamOf(s, p.team).filter((q) => !isKeeper(q));
      const target = mates.sort((a, b) => openness(s, b) - openness(s, a))[0];
      pass(s, p, target.x - p.x, target.y - p.y, false, target);
    }
    return;
  }

  // Dribble towards goal, sliding away from the closest defender.
  let tx = gx - d * 6, ty = W / 2 + (p.y - W / 2) * 0.5;
  if (pressure < 5) {
    const away = p.y < nearest.y ? -1 : 1;
    ty = clamp(p.y + away * 4, 3, W - 3);
    tx = p.x + d * 5;
  }
  moveTo(p, tx, ty, 0.92);

  if ((p.decision -= DT) > 0) return;
  p.decision = 0.3 + rand(s) * 0.25;
  if (goalDist < 24 && rand(s) < (goalDist < 15 ? 0.7 : 0.35)) return shoot(s, p, 0.55 + rand(s) * 0.45, randSigned(s) * 0.9);
  if ((pressure < 3 && rand(s) < 0.6) || rand(s) < 0.1) {
    const target = bestPassTarget(s, p);
    if (target) pass(s, p, target.x - p.x, target.y - p.y, false, target);
  }
}

/** How free a player is (distance to the nearest opponent). */
function openness(s: MatchState, p: PlayerState) {
  let best = Infinity;
  for (const o of s.players) if (o.team !== p.team) best = Math.min(best, dist(o, p));
  return best;
}

function bestPassTarget(s: MatchState, p: PlayerState) {
  const d = dirOf(p.team);
  let best: PlayerState | null = null, bestScore = -Infinity;
  for (const q of teamOf(s, p.team)) {
    if (q.id === p.id || isKeeper(q)) continue;
    const dd = dist(p, q);
    if (dd < 5 || dd > 35) continue;
    const score = (q.x - p.x) * d * 0.08 + Math.min(openness(s, q), 8) * 0.4 - dd * 0.03;
    if (score > bestScore) { bestScore = score; best = q; }
  }
  return best;
}

/* ------------------------------------------------------------------ actions */

/** Passes in a direction: picks the teammate best lined up with it (or `forced`). */
function pass(s: MatchState, p: PlayerState, dirX: number, dirY: number, through: boolean, forced?: PlayerState) {
  const dl = len(dirX, dirY) || 1;
  const ux = dirX / dl, uy = dirY / dl;
  let target = forced ?? null;
  if (!target) {
    let bestScore = -Infinity;
    for (const q of teamOf(s, p.team)) {
      if (q.id === p.id) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = len(dx, dy);
      if (d < 3) continue;
      const cos = (dx * ux + dy * uy) / d;
      if (cos < 0.3) continue;
      const score = cos * 2 - d / 40 - (isKeeper(q) ? 0.8 : 0);
      if (score > bestScore) { bestScore = score; target = q; }
    }
  }
  const d = dirOf(p.team);
  let tx: number, ty: number;
  if (target) {
    const lead = dist(p, target) / 16;
    tx = target.x + target.vx * lead + (through ? d * 7 : 0);
    ty = target.y + target.vy * lead;
  } else {
    // Nobody that way: play it into space.
    tx = p.x + ux * (through ? 18 : 12);
    ty = p.y + uy * (through ? 18 : 12);
  }
  tx = clamp(tx, 1, L - 1);
  ty = clamp(ty, 1, W - 1);
  const dx = tx - p.x, dy = ty - p.y, dd = len(dx, dy) || 1;
  const speed = clamp(dd * 0.85 + 7, 9, 24) + (through ? 2 : 0);
  const noise = randSigned(s) * ((110 - p.stats.passing) / 100) * 0.12;
  kick(s, p, dx / dd, dy / dd, speed, noise);
  s.ball.intendedFor = target?.id ?? null;
  if (p.team === 0 && target && !isKeeper(target)) s.controlled = target.id; // the camera of control follows the pass
}

function shoot(s: MatchState, p: PlayerState, charge: number, aimY: number) {
  const gx = oppGoalX(p.team);
  const gy = W / 2 + clamp(aimY, -1, 1) * (GOAL_HALF - 0.6) + randSigned(s) * 0.4;
  const dx = gx - p.x, dy = gy - p.y, d = len(dx, dy) || 1;
  const power = (15 + charge * 16) * (0.85 + p.stats.shooting / 600);
  const noise = randSigned(s) * ((105 - p.stats.shooting) / 100) * 0.16 * (0.6 + charge * 0.6);
  kick(s, p, dx / d, dy / d, power, noise);
  s.ball.intendedFor = null;
}

/** Releases the ball along (ux, uy) with sideways error `noise` (no trigonometry). */
function kick(s: MatchState, p: PlayerState, ux: number, uy: number, speed: number, noise: number) {
  let kx = ux - uy * noise, ky = uy + ux * noise;
  const k = len(kx, ky) || 1;
  kx /= k; ky /= k;
  const b = s.ball;
  b.owner = null;
  b.x = p.x + kx * 0.9;
  b.y = p.y + ky * 0.9;
  b.vx = kx * speed;
  b.vy = ky * speed;
  b.lastTouch = p.team;
  b.lastKicker = p.id;
  p.kickCooldown = 0.3;
}

function tackle(s: MatchState, p: PlayerState) {
  if (p.tackleCooldown > 0 || p.stun > 0) return;
  p.tackleCooldown = 0.9;
  const owner = s.ball.owner !== null ? s.players[s.ball.owner] : null;
  if (!owner || owner.team === p.team || dist(owner, p) > TACKLE_RANGE) {
    p.stun = 0.25; // a mistimed lunge
    return;
  }
  const chance = clamp(0.42 + (p.stats.defending - owner.stats.dribbling) / 120, 0.15, 0.85);
  if (rand(s) < chance) {
    const b = s.ball;
    b.owner = null;
    b.vx = p.fx * 3 + randSigned(s);
    b.vy = p.fy * 3 + randSigned(s);
    b.lastTouch = p.team;
    owner.stun = 0.5;
    owner.kickCooldown = 0.5;
  } else {
    p.stun = 0.55;
  }
}

/* ------------------------------------------------------------------- keeper */

function keeper(s: MatchState, p: PlayerState, restart: boolean) {
  const b = s.ball;
  if (b.owner === p.id) return carry(s, p);
  const gx = ownGoalX(p.team), d = dirOf(p.team);
  const lineX = gx + d * 1.2;
  const near = Math.abs(b.x - gx) < 20;
  const tx = near ? lineX + (b.x - lineX) * 0.12 : lineX + d * 2;
  const ty = clamp(W / 2 + (b.y - W / 2) * (near ? 0.35 : 0.15), W / 2 - GOAL_HALF - 0.4, W / 2 + GOAL_HALF + 0.4);
  moveTo(p, tx, ty, 0.85);
  if (restart || b.owner !== null || p.kickCooldown > 0) return;

  // Shot-stopping: the ball is heading for our goal and within reach.
  const towards = b.vx * -d > 2;
  const reach = 1.1 + (p.stats.overall / 100) * 0.9;
  if (towards && dist(p, b) < reach && b.lastTouch !== p.team) {
    const speed = len(b.vx, b.vy);
    const chance = clamp(1.05 - speed * 0.022 + (p.stats.overall - 65) / 120, 0.25, 0.95);
    if (rand(s) < chance) {
      giveBall(s, p);
      p.decision = 1;
    } else {
      p.kickCooldown = 0.6;
      b.vx *= 0.75;
      b.vy = b.vy * 0.75 + randSigned(s) * 3;
    }
  }
}

/* --------------------------------------------------------------------- ball */

function moveBallFree(s: MatchState) {
  const b = s.ball;
  let v = len(b.vx, b.vy);
  if (v > 0) {
    const nv = Math.max(0, v - (v * BALL_DRAG + BALL_DECEL) * DT);
    b.vx *= nv / v; b.vy *= nv / v;
    v = nv;
  }
  b.x += b.vx * DT;
  b.y += b.vy * DT;
  return v;
}

function updateBall(s: MatchState) {
  const b = s.ball;
  if (b.owner !== null) {
    const p = s.players[b.owner];
    b.x = p.x + p.fx * DRIBBLE_OFFSET;
    b.y = p.y + p.fy * DRIBBLE_OFFSET;
    b.vx = p.vx;
    b.vy = p.vy;
  } else {
    const v = moveBallFree(s);
    // Pick-ups and interceptions.
    let best: PlayerState | null = null, bestD = Infinity;
    for (const p of s.players) {
      if (p.kickCooldown > 0 || p.stun > 0) continue;
      const reach = p.id === b.intendedFor ? 1.1 : v < 10 ? 0.85 : 0.6;
      const d = dist(p, b);
      if (d < reach && d < bestD && !(isKeeper(p) && v > 10 && b.lastTouch !== p.team)) { best = p; bestD = d; }
    }
    if (best) giveBall(s, best);
  }
  checkOut(s);
}

function checkOut(s: MatchState) {
  const b = s.ball;
  const inGoalMouth = Math.abs(b.y - W / 2) < GOAL_HALF;
  if (b.x < 0 || b.x > L) {
    const side: TeamIndex = b.x < 0 ? 0 : 1; // whose goal line
    if (inGoalMouth && b.owner === null) return goal(s, (1 - side) as TeamIndex);
    if (inGoalMouth) b.x = clamp(b.x, 0.2, L - 0.2); // a dribbler can't walk it in
    const attacker = (1 - side) as TeamIndex;
    if (b.lastTouch === side) return restartAt(s, attacker, b.x < 0 ? 0.5 : L - 0.5, b.y < W / 2 ? 0.5 : W - 0.5, "corner");
    return restartAt(s, side, side === 0 ? 5.5 : L - 5.5, W / 2, "goal-kick");
  }
  if (b.y < 0 || b.y > W) {
    const team = (b.lastTouch === 0 ? 1 : 0) as TeamIndex;
    return restartAt(s, team, clamp(b.x, 1, L - 1), b.y < 0 ? 0.3 : W - 0.3, "throw-in");
  }
}

function restartAt(s: MatchState, team: TeamIndex, x: number, y: number, kind: "throw-in" | "corner" | "goal-kick") {
  s.phase = "restart";
  s.phaseTimer = RESTART_SECONDS;
  s.restart = { team, x, y, kind };
  s.charge = 0;
  Object.assign(s.ball, { x, y, vx: 0, vy: 0, owner: null, intendedFor: null });
}

function goal(s: MatchState, team: TeamIndex) {
  s.score[team]++;
  const kicker = s.ball.lastKicker !== null ? s.players[s.ball.lastKicker] : null;
  const scorer = !kicker ? "Unknown" : kicker.team === team ? kicker.name : `${kicker.name} (OG)`;
  s.goals.push({ team, scorer, minute: Math.max(1, minuteOf(s)) });
  s.phase = "goal";
  s.phaseTimer = GOAL_SECONDS;
  s.kickoffTeam = (1 - team) as TeamIndex;
  s.charge = 0;
}
