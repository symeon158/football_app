import { describe, expect, it } from "vitest";

import { generateOpponent } from "./opponent";
import { playMatch, simulateMatch } from "./simulate";
import type { LiveStep, MatchInput } from "./types";

const input = (seed: number): MatchInput => ({
  seed,
  home: { ...generateOpponent(seed + 1, 72), name: "Home FC" },
  away: generateOpponent(seed + 2, 72),
  homeBonusPct: 5,
  keyMoments: true,
});

/** Plays a whole interactive match, always picking option `pick(moment)`. */
function playThrough(m: MatchInput, pick: (step: Extract<LiveStep, { done: false }>) => string) {
  const decisions: string[] = [];
  for (let i = 0; i < 10; i++) {
    const step = playMatch(m, decisions);
    if (step.done) return { result: step.result, decisions };
    expect(step.moment.index).toBe(decisions.length);
    decisions.push(pick(step));
  }
  throw new Error("too many moments");
}

describe("key moments", () => {
  it("pauses for a decision and offers valid options", () => {
    const step = playMatch(input(11), []);
    expect(step.done).toBe(false);
    if (step.done) return;
    expect(step.moment.index).toBe(0);
    expect(step.moment.options.length).toBeGreaterThanOrEqual(2);
    expect(step.events[0].type).toBe("kickoff");
  });

  it("every match has between 2 and 6 moments and finishes", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { result, decisions } = playThrough(input(seed), (s) => s.moment.options[0].id);
      expect(decisions.length).toBeGreaterThanOrEqual(2); // team talk + late call at least
      expect(decisions.length).toBeLessThanOrEqual(6);
      expect(result.events.at(-1)?.type).toBe("full_time");
      const goals = result.events.filter((e) => e.type === "goal");
      expect(goals.filter((g) => g.side === "home").length).toBe(result.score.home);
      expect(goals.filter((g) => g.side === "away").length).toBe(result.score.away);
    }
  });

  it("is deterministic: the same decisions always give the same match", () => {
    const pick = (s: Extract<LiveStep, { done: false }>) => s.moment.options[s.moment.index % s.moment.options.length].id;
    const a = playThrough(input(42), pick);
    const b = playThrough(input(42), pick);
    expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
    expect(JSON.stringify(simulateMatch(input(42), a.decisions))).toBe(JSON.stringify(a.result));
  });

  it("a decision only changes what happens from that moment on", () => {
    const m = input(7);
    const first = playMatch(m, []);
    if (first.done) throw new Error("expected a moment");
    const optA = playMatch(m, [first.moment.options[0].id]);
    const optB = playMatch(m, [first.moment.options[1].id]);
    const before = (s: LiveStep) => (s.done ? s.result.events : s.events).filter((e) => e.minute < first.moment.minute);
    expect(JSON.stringify(before(optA))).toBe(JSON.stringify(before(optB)));
  });

  it("rejects a decision that isn't one of the options", () => {
    expect(() => playMatch(input(3), ["teleport"])).toThrow("INVALID_DECISION");
  });

  it("classic matches (no key moments) never pause", () => {
    const step = playMatch({ ...input(5), keyMoments: undefined }, []);
    expect(step.done).toBe(true);
  });
});
