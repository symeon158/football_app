import { describe, expect, it } from "vitest";

import { generateOpponent } from "./opponent";
import { Rng } from "./rng";
import { simulateMatch } from "./simulate";
import type { MatchInput, TeamSheet } from "./types";

const team = (seed: number, rating: number, overrides: Partial<TeamSheet> = {}): TeamSheet => ({
  ...generateOpponent(seed, rating),
  tactic: "balanced",
  ...overrides,
});

/** A "user" team: opponent-generated players given card ids so ownership links can be checked. */
function userTeam(seed: number, rating: number, overrides: Partial<TeamSheet> = {}): TeamSheet {
  const t = team(seed, rating, overrides);
  let n = 0;
  const withIds = (p: TeamSheet["bench"][number]) => ({ ...p, id: `own-${seed}-${n++}` });
  const starters = t.starters.map((s) => ({ ...s, player: withIds(s.player) }));
  return { ...t, starters, bench: t.bench.map(withIds), captainId: starters[9].player.id, ...overrides };
}

const outcome = (n: number, make: (i: number) => MatchInput) => {
  let hw = 0, d = 0, aw = 0, goals = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(make(i));
    goals += r.score.home + r.score.away;
    if (r.score.home > r.score.away) hw++; else if (r.score.home === r.score.away) d++; else aw++;
  }
  return { home: hw / n, draw: d / n, away: aw / n, goals: goals / n };
};

describe("Rng", () => {
  it("is deterministic per seed and uniform enough", () => {
    const a = new Rng(7), b = new Rng(7), c = new Rng(8);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(xs);
    const r = new Rng(1);
    const mean = Array.from({ length: 20000 }, () => r.next()).reduce((s, v) => s + v, 0) / 20000;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it("weighted() respects zero weights", () => {
    const r = new Rng(3);
    for (let i = 0; i < 500; i++) expect(r.weighted(["a", "b", "c"], (x) => (x === "b" ? 0 : 1))).not.toBe("b");
    expect(r.weighted(["a"], () => 0)).toBeUndefined();
  });
});

describe("simulateMatch — determinism", () => {
  const input: MatchInput = { seed: 123456, home: userTeam(1, 72), away: team(2, 70), homeBonusPct: 3 };

  it("same input → identical result", () => {
    expect(simulateMatch(input)).toEqual(simulateMatch(input));
  });

  it("replays from a JSON round-trip (what we store in the database)", () => {
    const stored = JSON.parse(JSON.stringify(input)) as MatchInput;
    expect(simulateMatch(stored)).toEqual(simulateMatch(input));
  });

  it("different seeds give different matches", () => {
    const scores = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(simulateMatch({ ...input, seed: i }).events.length + "|" + JSON.stringify(simulateMatch({ ...input, seed: i }).score))));
    expect(scores.size).toBeGreaterThan(10);
  });

  it("generated squads never repeat a name", () => {
    for (let seed = 0; seed < 500; seed++) {
      const t = generateOpponent(seed, 70);
      const names = [...t.starters.map((s) => s.player.name), ...t.bench.map((p) => p.name)];
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("opponents are reproducible from the seed", () => {
    expect(generateOpponent(99, 75)).toEqual(generateOpponent(99, 75));
    expect(generateOpponent(99, 75)).not.toEqual(generateOpponent(100, 75));
  });
});

describe("simulateMatch — invariants over many matches", { timeout: 30_000 }, () => {
  it("events are consistent with the score and the line-ups", () => {
    for (let seed = 0; seed < 300; seed++) {
      const home = userTeam(seed, 70), away = team(seed + 5000, 70);
      const r = simulateMatch({ seed, home, away, homeBonusPct: 5 });
      const goals = { home: 0, away: 0 };
      let lastMinute = 0;
      const sentOff = new Set<string>();
      const onPitch = { home: new Set(home.starters.map((s) => s.player.name)), away: new Set(away.starters.map((s) => s.player.name)) };
      const subs = { home: 0, away: 0 };

      expect(r.events[0].type).toBe("kickoff");
      expect(r.events.at(-1)?.type).toBe("full_time");
      for (const e of r.events) {
        expect(e.minute).toBeGreaterThanOrEqual(lastMinute);
        lastMinute = e.minute;
        if (e.side && e.playerName && e.type !== "save") {
          expect(sentOff.has(`${e.side}:${e.playerName}`), `${e.playerName} acted after being sent off`).toBe(false);
        }
        if (e.type === "goal") {
          goals[e.side!]++;
          expect(onPitch[e.side!].has(e.playerName!), "scorer must be on the pitch").toBe(true);
          if (e.assistName) {
            expect(e.assistName).not.toBe(e.playerName);
            expect(onPitch[e.side!].has(e.assistName)).toBe(true);
          }
        }
        if (e.type === "substitution") {
          subs[e.side!]++;
          onPitch[e.side!].delete(e.assistName!);
          onPitch[e.side!].add(e.playerName!);
        }
        if (e.type === "red_card") {
          sentOff.add(`${e.side}:${e.playerName}`);
          onPitch[e.side!].delete(e.playerName!);
        }
      }
      expect(goals).toEqual(r.score);
      expect(subs.home).toBeLessThanOrEqual(3);
      expect(subs.away).toBeLessThanOrEqual(3);
      expect(r.stats.home.possession + r.stats.away.possession).toBe(100);
      expect(r.stats.home.shotsOnTarget).toBeLessThanOrEqual(r.stats.home.shots);
      expect(r.stats.home.shotsOnTarget).toBeGreaterThanOrEqual(r.score.home);
      for (const p of r.ratings) {
        expect(p.rating).toBeGreaterThanOrEqual(3);
        expect(p.rating).toBeLessThanOrEqual(10);
      }
      // Card links: the user's events reference real ownership ids; the opponent's never do.
      for (const e of r.events.filter((x) => x.side === "away")) expect(e.playerId).toBeNull();
      for (const e of r.events.filter((x) => x.side === "home" && x.playerName)) expect(e.playerId).toMatch(/^own-/);
    }
  });
});

// Deliberately heavy (2,000 simulations per test): allow for a busy machine.
describe("simulateMatch — football sense (statistical, 2,000 matches each)", { timeout: 30_000 }, () => {
  const N = 2000;
  const eq = (i: number, home: Partial<TeamSheet> = {}, away: Partial<TeamSheet> = {}, bonus = 0): MatchInput => ({
    seed: 50_000 + i, home: team(i * 2, 70, home), away: team(i * 2 + 1, 70, away), homeBonusPct: bonus,
  });

  it("equal teams: realistic scoring and balanced outcomes", () => {
    const o = outcome(N, (i) => eq(i));
    expect(o.goals).toBeGreaterThan(2.2);
    expect(o.goals).toBeLessThan(3.1);
    expect(Math.abs(o.home - o.away)).toBeLessThan(0.06);
    expect(o.draw).toBeGreaterThan(0.18);
    expect(o.draw).toBeLessThan(0.33);
  });

  it("better players win more", () => {
    const o = outcome(N, (i) => ({ seed: 60_000 + i, home: team(i * 2, 76), away: team(i * 2 + 1, 70), homeBonusPct: 0 }));
    expect(o.home).toBeGreaterThan(0.5);
    expect(o.home).toBeLessThan(0.75);
  });

  it("stadium home advantage helps, modestly", () => {
    const base = outcome(N, (i) => eq(i));
    const boosted = outcome(N, (i) => eq(i, {}, {}, 15));
    expect(boosted.home - base.home).toBeGreaterThan(0.03);
    expect(boosted.home - base.home).toBeLessThan(0.15);
  });

  it("chemistry matters", () => {
    const low = outcome(N, (i) => eq(i, { chemistry: 10 }, { chemistry: 60 }));
    const high = outcome(N, (i) => eq(i, { chemistry: 100 }, { chemistry: 60 }));
    expect(high.home).toBeGreaterThan(low.home + 0.05);
  });

  it("attacking tactics mean more goals at both ends; defensive fewer", () => {
    const att = outcome(N, (i) => eq(i, { tactic: "attacking" }, { tactic: "attacking" }));
    const def = outcome(N, (i) => eq(i, { tactic: "defensive" }, { tactic: "defensive" }));
    expect(att.goals).toBeGreaterThan(def.goals + 0.6);
  });

  it("playing people out of position hurts", () => {
    const natural = outcome(N, (i) => eq(i));
    const scrambled = outcome(N, (i) => {
      const m = eq(i);
      // Reverse the outfield order: defenders up front, attackers at the back.
      const [gk, ...rest] = m.home.starters;
      const players = rest.map((s) => s.player).reverse();
      return { ...m, home: { ...m.home, starters: [gk, ...rest.map((s, k) => ({ slotPosition: s.slotPosition, player: players[k] }))] } };
    });
    expect(scrambled.home).toBeLessThan(natural.home - 0.1);
  });
});
