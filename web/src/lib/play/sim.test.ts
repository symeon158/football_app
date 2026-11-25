import { describe, expect, it } from "vitest";

import { createMatch, step } from "./sim";
import { NO_INPUT, PITCH, type PlayInput, type PlaySetup } from "./types";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"] as const;
const SLOTS: [number, number][] = [[50, 6], [15, 28], [37, 24], [63, 24], [85, 28], [30, 50], [50, 46], [70, 50], [18, 76], [50, 84], [82, 76]];

function setup(seed: number, ovr = 70): PlaySetup {
  const team = (name: string) => ({
    name, short: name.slice(0, 3).toUpperCase(), kit: { primary: "#1f6feb", secondary: "#ffffff" },
    players: ROLES.map((role, i) => ({
      name: `${name} ${i}`, role, slotX: SLOTS[i][0], slotY: SLOTS[i][1],
      stats: { overall: ovr, pace: ovr, shooting: ovr, passing: ovr, dribbling: ovr, defending: ovr, physicality: ovr },
    })),
  });
  return { seed, teams: [team("Home"), team("Away")] };
}

/** A scripted "human": runs, passes and shoots on a fixed pattern. */
const scripted = (tick: number): PlayInput => ({
  moveX: Math.sign(((tick / 50) | 0) % 3 - 1),
  moveY: Math.sign(((tick / 70) | 0) % 3 - 1),
  sprint: tick % 200 < 80,
  pass: tick % 97 === 0,
  through: tick % 233 === 0,
  shootHeld: tick % 311 > 280,
  switchPlayer: tick % 401 === 0,
});

const run = (seed: number, ticks: number, input: (t: number) => PlayInput) => {
  const s = createMatch(setup(seed));
  for (let t = 0; t < ticks; t++) step(s, input(t));
  return s;
};

const playUntil = (s: ReturnType<typeof createMatch>, phase: string) => {
  for (let i = 0; i < 1000 && s.phase !== phase; i++) step(s, NO_INPUT);
};

describe("playable match simulation", () => {
  it("is deterministic: same seed and inputs give the identical match", () => {
    const a = run(1234, 6000, scripted);
    const b = run(1234, 6000, scripted);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(run(99, 6000, scripted))).not.toBe(JSON.stringify(a));
  });

  it("plays two halves to full time with sane, consistent numbers", () => {
    const s = run(7, 60 * 60 * 8, scripted);
    expect(s.phase).toBe("fulltime");
    expect(s.half).toBe(2);
    expect(s.score[0] + s.score[1]).toBe(s.goals.length);
    expect(s.score[0] + s.score[1]).toBeLessThan(20);
    for (const p of s.players) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  }, 30_000);

  it("a shot into an empty net is a goal for the shooter's team", () => {
    const s = createMatch(setup(5));
    playUntil(s, "play");
    const striker = s.players[9];
    const keeper = s.players[11];
    Object.assign(keeper, { x: PITCH.length - 3, y: 2, stun: 5 });
    Object.assign(striker, { x: 94, y: PITCH.width / 2, vx: 0, vy: 0 });
    s.ball.owner = striker.id;
    s.controlled = striker.id;
    for (let t = 0; t < 30; t++) step(s, { ...NO_INPUT, shootHeld: true });
    for (let t = 0; t < 120 && s.phase === "play"; t++) step(s, NO_INPUT);
    expect(s.score).toEqual([1, 0]);
    expect(s.goals[0]).toMatchObject({ team: 0, scorer: striker.name });
  });

  it("a ball over the touchline is a throw-in for the other team", () => {
    const s = createMatch(setup(6));
    playUntil(s, "play");
    const p = s.players[1];
    Object.assign(s.ball, { owner: null, x: 40, y: 1, vx: 0, vy: -12, lastTouch: 0 });
    p.kickCooldown = 1;
    for (let t = 0; t < 20 && s.phase === "play"; t++) step(s, NO_INPUT);
    expect(s.phase).toBe("restart");
    expect(s.restart).toMatchObject({ team: 1, kind: "throw-in" });
  });
});
