import { describe, expect, it } from "vitest";

import { generateOpponent } from "./opponent";
import { playMatch, simulateMatch } from "./simulate";
import type { LiveStep, MatchInput, MatchOrder } from "./types";

const input = (seed: number): MatchInput => {
  const home = generateOpponent(seed + 1, 72);
  // Give the home bench ids so substitutions can name them (generated players have none).
  const withIds = <T extends { id: string | null }>(p: T, i: number, tag: string) => ({ ...p, id: `${tag}${i}` });
  return {
    seed,
    home: { ...home, name: "Home FC", starters: home.starters.map((s, i) => ({ ...s, player: withIds(s.player, i, "s") })), bench: home.bench.map((b, i) => withIds(b, i, "b")) },
    away: generateOpponent(seed + 2, 72),
    homeBonusPct: 5,
    matchday: true,
  };
};

type Paused = Extract<LiveStep, { done: false }>;

/** Mimics the server: reveal 5 minutes at a time, decide moments, give orders at the revealed minute. */
function serverLoop(m: MatchInput, plan: (s: Paused) => MatchOrder | null) {
  const decisions: string[] = [];
  const orders: MatchOrder[] = [];
  let revealed = 0;
  for (let i = 0; i < 200; i++) {
    const step = playMatch(m, decisions, { orders, untilMinute: revealed });
    if (step.done) return { result: step.result, decisions, orders };
    if (step.moment) {
      decisions.push(step.moment.options[0].id);
      continue;
    }
    const order = plan(step);
    if (order) orders.push(order);
    revealed = Math.min(90, revealed + 5);
  }
  throw new Error("never finished");
}

describe("matchday mode", () => {
  it("pauses at the revealed minute and never shows events beyond it", () => {
    const step = playMatch(input(3), [], { untilMinute: 20 });
    expect(step.done).toBe(false);
    if (step.done) return;
    expect(step.minute).toBeLessThanOrEqual(20);
    expect(step.events.every((e) => e.minute <= 20)).toBe(true);
    expect(step.home.onPitch).toHaveLength(11);
  });

  it("chunked play gives exactly the same match as playing it in one go", () => {
    for (const seed of [1, 2, 3]) {
      const sub = (s: Paused): MatchOrder | null =>
        s.minute === 60 && s.home.subsLeft > 0 && s.home.bench.length
          ? { minute: 60, kind: "sub", off: s.home.onPitch.find((p) => p.position !== "GK")!.id!, on: s.home.bench[0].id! }
          : s.minute === 30 ? { minute: 30, kind: "shout", value: "press" } : null;
      const run = serverLoop(input(seed), sub);
      expect(JSON.stringify(simulateMatch(input(seed), run.decisions, run.orders))).toBe(JSON.stringify(run.result));
    }
  });

  it("an order only changes the match after the minute it was given", () => {
    const m = input(9);
    const order: MatchOrder = { minute: 40, kind: "tactic", value: "attacking" };
    const keep = playMatch(m, ["balanced", "shoot", "shoot", "shoot", "left"].slice(0, 0), { untilMinute: 40 });
    const changed = playMatch(m, [], { untilMinute: 40, orders: [order] });
    const upTo40 = (s: LiveStep) => (s.done ? s.result.events : s.events).filter((e) => e.minute <= 40);
    expect(JSON.stringify(upTo40(changed))).toBe(JSON.stringify(upTo40(keep)));
  });

  it("substitutions are made by the manager and players tire", () => {
    const m = input(4);
    const first = playMatch(m, [], { untilMinute: 30 });
    if (first.done) throw new Error("expected a pause");
    const decisions: string[] = [];
    let step = first;
    // Resolve any moments before 30'.
    while (step.moment) {
      decisions.push(step.moment.options[0].id);
      const next = playMatch(m, decisions, { untilMinute: 30 });
      if (next.done) throw new Error("ended early");
      step = next;
    }
    expect(Math.min(...step.home.onPitch.map((p) => p.stamina))).toBeLessThan(100);
    const off = step.home.onPitch.find((p) => p.position !== "GK")!;
    const on = step.home.bench[0];
    // An order given at the revealed minute shows in the team straight away and counts from 31'.
    const after = playMatch(m, decisions, { untilMinute: 30, orders: [{ minute: 30, kind: "sub", off: off.id!, on: on.id! }] });
    if (after.done) throw new Error("ended early");
    expect(after.home.bench).toHaveLength(step.home.bench.length - 1);
    expect(after.home.onPitch.some((p) => p.id === on.id)).toBe(true);
    expect(after.home.onPitch.some((p) => p.id === off.id)).toBe(false);
    expect(after.home.subsLeft).toBe(4);
    expect(after.events.some((e) => e.type === "substitution" && e.side === "home" && e.minute === 31)).toBe(true);
    // Nothing that happened up to 30' changes.
    const upTo30 = (s: LiveStep) => (s.done ? [] : s.events).filter((e) => e.minute <= 30);
    expect(JSON.stringify(upTo30(after))).toBe(JSON.stringify(upTo30(step)));
  });

  it("there are no automatic home substitutions and no 75' call", () => {
    const run = serverLoop(input(6), () => null);
    expect(run.result.events.some((e) => e.type === "substitution" && e.side === "home")).toBe(false);
    expect(run.decisions.length).toBeLessThanOrEqual(5); // team talk + up to 3 chances + maybe a penalty
  });
});
