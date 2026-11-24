import { LINE_OF } from "@/lib/game/lineup";
import { effectiveRating, type Position } from "@/lib/game/team-rating";

import { Rng } from "./rng";
import { ENGINE_VERSION, type EnginePlayer, type MatchEvent, type MatchInput, type MatchResult, type PlayerRating, type Side, type TeamSheet, type TeamStats } from "./types";

/**
 * Deterministic, minute-by-minute football simulation.
 *
 * Inputs: attributes, positions (out-of-position penalties via
 * effectiveRating), formation (which lines are filled), chemistry, captain,
 * tactic and the home side's stadium bonus. Same MatchInput → same result,
 * always: every random number comes from one seeded Rng, consumed in a fixed
 * order. Changing the order or the constants changes results — bump
 * ENGINE_VERSION when you do, so stored matches stay explainable.
 */

// Tuned so equal teams average ~2.7 goals per match (see engine.test.ts).
const TUNING = {
  chancePerMinute: 0.215,
  chanceExponent: 1.5,
  onTargetBase: 0.36,
  onTargetQuality: 0.55,
  goalFactor: 1.05,
  goalExponent: 1.0,
  possessionScale: 14,
  yellowPerMinute: 0.0165,
  straightRedPerMinute: 0.00012,
  homeBonusWeight: 0.2, // a fifth of the stadium's % applies to strength
  redCardPenalty: 0.07,
};

const TACTIC = {
  balanced: { attack: 1, defence: 1, chances: 1 },
  attacking: { attack: 1.05, defence: 0.96, chances: 1.08 },
  defensive: { attack: 0.95, defence: 1.05, chances: 0.92 },
} as const;

type OnPitch = { slotPosition: Position; player: EnginePlayer; yellow: boolean; sentOff: boolean; minuteOn: number; minuteOff: number | null };

type Live = {
  side: Side;
  sheet: TeamSheet;
  pitch: OnPitch[];
  bench: EnginePlayer[];
  subMinutes: number[];
  reds: number;
  stats: TeamStats;
  possessionMinutes: number;
  played: Map<EnginePlayer, OnPitch>; // everyone who appeared, for ratings
};

const avg = (xs: number[], fallback: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback);
const eff = (p: OnPitch) => effectiveRating({ slotPosition: p.slotPosition, cardPosition: p.player.position, overall: p.player.overall });
const active = (t: Live) => t.pitch.filter((p) => !p.sentOff);

function strengths(t: Live, homeBonusPct: number) {
  const on = active(t);
  const line = (l: "GK" | "DEF" | "MID" | "ATT") => on.filter((p) => LINE_OF[p.slotPosition] === l);
  const att = line("ATT"), mid = line("MID"), def = line("DEF"), gk = line("GK");

  const midScore = 0.7 * avg(mid.map(eff), 35) + 0.3 * avg(mid.map((p) => p.player.passing), 35);
  const attackScore = att.length
    ? 0.55 * avg(att.map(eff), 35) + 0.3 * midScore + 0.15 * avg(att.map((p) => p.player.shooting), 35)
    : 0.85 * midScore;
  const defenceScore = 0.65 * avg(def.map(eff), 35) + 0.35 * avg(def.map((p) => p.player.defending), 35);
  const gkScore = gk.length ? eff(gk[0]) : 25; // an outfielder in goal

  const tac = TACTIC[t.sheet.tactic];
  const captainOn = on.some((p) => p.player.id && p.player.id === t.sheet.captainId);
  const m =
    (0.9 + (0.2 * Math.max(0, Math.min(100, t.sheet.chemistry))) / 100) *
    (captainOn ? 1.01 : 1) *
    (t.side === "home" ? 1 + (Math.max(0, Math.min(15, homeBonusPct)) / 100) * TUNING.homeBonusWeight : 1) *
    Math.pow(1 - TUNING.redCardPenalty, t.reds) *
    Math.pow(on.length / 11, 0.5);

  return {
    attack: attackScore * m * tac.attack,
    midfield: midScore * m,
    defence: (0.8 * defenceScore + 0.2 * gkScore) * m * tac.defence,
    gk: gkScore * m,
    chanceMultiplier: tac.chances,
  };
}

function initLive(side: Side, sheet: TeamSheet, rng: Rng): Live {
  const pitch = sheet.starters.map((s) => ({ slotPosition: s.slotPosition, player: s.player, yellow: false, sentOff: false, minuteOn: 0, minuteOff: null }));
  const subs = Math.min(3, sheet.bench.length);
  const subMinutes = Array.from({ length: subs }, () => rng.int(56, 84)).sort((a, b) => a - b);
  const live: Live = {
    side, sheet, pitch, bench: [...sheet.bench], subMinutes, reds: 0, possessionMinutes: 0, played: new Map(),
    stats: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, yellowCards: 0, redCards: 0, saves: 0 },
  };
  for (const p of pitch) live.played.set(p.player, p);
  return live;
}

const LINE_SHOT_WEIGHT = { GK: 0, DEF: 0.35, MID: 1.4, ATT: 3 } as const;
const LINE_CARD_WEIGHT = { GK: 0.2, DEF: 2, MID: 1.5, ATT: 0.9 } as const;

export function simulateMatch(input: MatchInput): MatchResult {
  const rng = new Rng(input.seed);
  const home = initLive("home", input.home, rng);
  const away = initLive("away", input.away, rng);
  const teams = { home, away };
  const other = (s: Side): Side => (s === "home" ? "away" : "home");
  const events: MatchEvent[] = [];
  const goals = new Map<EnginePlayer, number>();
  const assists = new Map<EnginePlayer, number>();
  const score = { home: 0, away: 0 };

  const push = (e: Omit<MatchEvent, "playerId" | "playerName" | "assistId" | "assistName" | "detail"> & Partial<MatchEvent>) =>
    events.push({ playerId: null, playerName: null, assistId: null, assistName: null, detail: null, ...e });

  push({ minute: 0, type: "kickoff", side: null, detail: `${input.home.name} vs ${input.away.name}` });

  const firstHalfStoppage = rng.int(0, 2);
  const secondHalfStoppage = rng.int(1, 5);
  const minutes = [
    ...Array.from({ length: 45 + firstHalfStoppage }, (_, i) => Math.min(i + 1, 45)),
    -1, // half time marker
    ...Array.from({ length: 45 + secondHalfStoppage }, (_, i) => Math.min(46 + i, 90)),
  ];

  for (const minute of minutes) {
    if (minute === -1) {
      push({ minute: 45, type: "half_time", side: null, detail: `${score.home}–${score.away}` });
      continue;
    }

    // Substitutions (both sides, in fixed order for determinism)
    for (const t of [home, away]) {
      while (t.subMinutes.length && t.subMinutes[0] === minute) {
        t.subMinutes.shift();
        const candidates = active(t).filter((p) => p.slotPosition !== "GK");
        if (!candidates.length || !t.bench.length) continue;
        // Tired/booked players come off first; deterministic tie-break by name.
        const off = [...candidates].sort((a, b) => eff(a) - (a.yellow ? 6 : 0) - (eff(b) - (b.yellow ? 6 : 0)) || a.player.name.localeCompare(b.player.name))[0];
        const best = [...t.bench].sort(
          (a, b) =>
            effectiveRating({ slotPosition: off.slotPosition, cardPosition: b.position, overall: b.overall }) -
              effectiveRating({ slotPosition: off.slotPosition, cardPosition: a.position, overall: a.overall }) || a.name.localeCompare(b.name),
        )[0];
        t.bench.splice(t.bench.indexOf(best), 1);
        off.sentOff = false;
        off.minuteOff = minute;
        const replacement: OnPitch = { slotPosition: off.slotPosition, player: best, yellow: false, sentOff: false, minuteOn: minute, minuteOff: null };
        t.pitch[t.pitch.indexOf(off)] = replacement;
        t.played.set(best, replacement);
        push({ minute, type: "substitution", side: t.side, playerId: best.id, playerName: best.name, assistId: off.player.id, assistName: off.player.name, detail: `${best.name} replaces ${off.player.name}` });
      }
    }

    const sH = strengths(home, input.homeBonusPct);
    const sA = strengths(away, input.homeBonusPct);
    const pHome = 1 / (1 + Math.exp(-(sH.midfield - sA.midfield) / TUNING.possessionScale));
    const attSide: Side = rng.chance(pHome) ? "home" : "away";
    const atk = teams[attSide], def = teams[other(attSide)];
    const sAtk = attSide === "home" ? sH : sA, sDef = attSide === "home" ? sA : sH;
    atk.possessionMinutes++;

    // Chance creation
    const pChance = TUNING.chancePerMinute * sAtk.chanceMultiplier * Math.pow(sAtk.attack / Math.max(1, sDef.defence), TUNING.chanceExponent);
    if (rng.chance(Math.min(0.45, pChance))) {
      const shooter = rng.weighted(active(atk), (p) => LINE_SHOT_WEIGHT[LINE_OF[p.slotPosition]] * p.player.shooting);
      const quality = 0.03 + Math.pow(rng.next(), 1.6) * 0.5; // xG of the chance
      atk.stats.shots++;
      atk.stats.xg += quality;
      if (shooter && rng.chance(TUNING.onTargetBase + quality * TUNING.onTargetQuality)) {
        atk.stats.shotsOnTarget++;
        const finishing = 0.5 * shooter.player.shooting + 0.5 * sAtk.attack;
        const pGoal = Math.max(0.02, Math.min(0.88, quality * TUNING.goalFactor * Math.pow(finishing / Math.max(1, sDef.gk), TUNING.goalExponent)));
        if (rng.chance(pGoal)) {
          score[attSide]++;
          goals.set(shooter.player, (goals.get(shooter.player) ?? 0) + 1);
          const assister = rng.chance(0.82)
            ? rng.weighted(active(atk).filter((p) => p !== shooter), (p) => (LINE_OF[p.slotPosition] === "GK" ? 0.05 : 1) * p.player.passing)
            : undefined;
          if (assister) assists.set(assister.player, (assists.get(assister.player) ?? 0) + 1);
          push({
            minute, type: "goal", side: attSide,
            playerId: shooter.player.id, playerName: shooter.player.name,
            assistId: assister?.player.id ?? null, assistName: assister?.player.name ?? null,
            detail: `${score.home}–${score.away}`,
          });
        } else {
          def.stats.saves++;
          const keeper = active(def).find((p) => p.slotPosition === "GK");
          if (quality > 0.18) {
            push({ minute, type: "save", side: def.side, playerId: keeper?.player.id ?? null, playerName: keeper?.player.name ?? null, detail: `Denies ${shooter.player.name}` });
          }
        }
      } else if (shooter && quality > 0.3) {
        push({ minute, type: "chance", side: attSide, playerId: shooter.player.id, playerName: shooter.player.name, detail: "Big chance missed" });
      }
    }

    // Discipline
    for (const t of [home, away]) {
      if (rng.chance(TUNING.yellowPerMinute)) {
        const who = rng.weighted(active(t), (p) => LINE_CARD_WEIGHT[LINE_OF[p.slotPosition]] * (0.5 + p.player.physicality / 100));
        if (who) {
          t.stats.yellowCards++;
          if (who.yellow) {
            who.sentOff = true;
            who.minuteOff = minute;
            t.reds++;
            t.stats.redCards++;
            push({ minute, type: "red_card", side: t.side, playerId: who.player.id, playerName: who.player.name, detail: "Second yellow" });
          } else {
            who.yellow = true;
            push({ minute, type: "yellow_card", side: t.side, playerId: who.player.id, playerName: who.player.name });
          }
        }
      }
      if (rng.chance(TUNING.straightRedPerMinute)) {
        const who = rng.weighted(active(t), (p) => LINE_CARD_WEIGHT[LINE_OF[p.slotPosition]]);
        if (who) {
          who.sentOff = true;
          who.minuteOff = minute;
          t.reds++;
          t.stats.redCards++;
          push({ minute, type: "red_card", side: t.side, playerId: who.player.id, playerName: who.player.name, detail: "Straight red" });
        }
      }
    }
  }

  push({ minute: 90, type: "full_time", side: null, detail: `${score.home}–${score.away}` });

  const totalPoss = home.possessionMinutes + away.possessionMinutes || 1;
  home.stats.possession = Math.round((home.possessionMinutes / totalPoss) * 100);
  away.stats.possession = 100 - home.stats.possession;
  home.stats.xg = Math.round(home.stats.xg * 100) / 100;
  away.stats.xg = Math.round(away.stats.xg * 100) / 100;

  // Player ratings (everyone who appeared)
  const ratings: PlayerRating[] = [];
  for (const t of [home, away]) {
    const conceded = score[other(t.side)];
    const scored = score[t.side];
    const result = scored > conceded ? 0.5 : scored === conceded ? 0 : -0.3;
    for (const [player, onp] of t.played) {
      const g = goals.get(player) ?? 0;
      const a = assists.get(player) ?? 0;
      const line = LINE_OF[onp.slotPosition];
      const minutesPlayed = (onp.minuteOff ?? 90) - onp.minuteOn;
      let r = 6.0 + result + g * 1.1 + a * 0.6 + (eff(onp) - 65) / 30 + rng.range(-0.3, 0.3);
      if (line === "GK") r += t.stats.saves * 0.25 - conceded * 0.3 + (conceded === 0 ? 0.6 : 0);
      if (line === "DEF") r += (conceded === 0 ? 0.5 : 0) - conceded * 0.15;
      if (onp.yellow) r -= 0.3;
      if (onp.sentOff) r -= 1.5;
      if (minutesPlayed < 20) r = 6.0 + (r - 6.0) * 0.5; // short cameos stay near average
      ratings.push({ side: t.side, id: player.id, name: player.name, position: onp.slotPosition, rating: Math.round(Math.max(3, Math.min(10, r)) * 10) / 10, goals: g, assists: a });
    }
  }
  const manOfTheMatch = [...ratings].sort((a, b) => b.rating - a.rating || b.goals - a.goals || a.name.localeCompare(b.name))[0] ?? null;

  return { engineVersion: ENGINE_VERSION, score, events, stats: { home: home.stats, away: away.stats }, ratings, manOfTheMatch };
}
