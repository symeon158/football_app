import { it } from "vitest";

import { generateOpponent } from "./opponent";
import { simulateMatch } from "./simulate";
import type { TeamSheet } from "./types";

/** Prints engine outcome statistics; skipped unless CALIBRATE=1. */
const run = process.env.CALIBRATE ? it : it.skip;

function stats(n: number, make: (i: number) => { home: TeamSheet; away: TeamSheet; bonus?: number }) {
  let goals = 0, hw = 0, d = 0, aw = 0, shots = 0, cards = 0, reds = 0;
  for (let i = 0; i < n; i++) {
    const { home, away, bonus } = make(i);
    const r = simulateMatch({ seed: 1000 + i, home, away, homeBonusPct: bonus ?? 0 });
    goals += r.score.home + r.score.away;
    shots += r.stats.home.shots + r.stats.away.shots;
    cards += r.stats.home.yellowCards + r.stats.away.yellowCards;
    reds += r.stats.home.redCards + r.stats.away.redCards;
    if (r.score.home > r.score.away) hw++; else if (r.score.home === r.score.away) d++; else aw++;
  }
  const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;
  return `goals/match ${(goals / n).toFixed(2)} | home ${pct(hw)} draw ${pct(d)} away ${pct(aw)} | shots ${(shots / n).toFixed(1)} | yellows ${(cards / n).toFixed(2)} reds ${(reds / n).toFixed(3)}`;
}

run("calibration report", { timeout: 120_000 }, () => {
  const N = 3000;
  const t = (seed: number, rating: number, tactic?: TeamSheet["tactic"]) => ({ ...generateOpponent(seed, rating), ...(tactic ? { tactic } : {}) });
  console.log("equal 70 v 70        ", stats(N, (i) => ({ home: t(i * 2, 70, "balanced"), away: t(i * 2 + 1, 70, "balanced") })));
  console.log("76 v 70 (+6)         ", stats(N, (i) => ({ home: t(i * 2, 76, "balanced"), away: t(i * 2 + 1, 70, "balanced") })));
  console.log("64 v 70 (-6)         ", stats(N, (i) => ({ home: t(i * 2, 64, "balanced"), away: t(i * 2 + 1, 70, "balanced") })));
  console.log("equal, home +15%     ", stats(N, (i) => ({ home: t(i * 2, 70, "balanced"), away: t(i * 2 + 1, 70, "balanced"), bonus: 15 })));
  console.log("both attacking       ", stats(N, (i) => ({ home: t(i * 2, 70, "attacking"), away: t(i * 2 + 1, 70, "attacking") })));
  console.log("both defensive       ", stats(N, (i) => ({ home: t(i * 2, 70, "defensive"), away: t(i * 2 + 1, 70, "defensive") })));
});
