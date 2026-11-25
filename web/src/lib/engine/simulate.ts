import { LINE_OF } from "@/lib/game/lineup";
import { effectiveRating, type Position } from "@/lib/game/team-rating";

import { Rng } from "./rng";
import {
  ENGINE_VERSION,
  type EnginePlayer,
  type HomeState,
  type KeyMoment,
  type LiveStep,
  type MatchEvent,
  type MatchInput,
  type MatchOrder,
  type MatchResult,
  type PlayerRating,
  type Side,
  type Tactic,
  type TeamSheet,
  type TeamStats,
} from "./types";

/**
 * Deterministic, minute-by-minute football simulation.
 *
 * Inputs: attributes, positions (out-of-position penalties via
 * effectiveRating), formation (which lines are filled), chemistry, captain,
 * tactic and the home side's stadium bonus. Same MatchInput → same result,
 * always: every random number comes from one seeded Rng, consumed in a fixed
 * order. Changing the order or the constants changes results — bump
 * ENGINE_VERSION when you do, so stored matches stay explainable.
 *
 * Interactive matches (input.keyMoments) additionally pause at key moments for
 * the home manager's decisions. Decision outcomes use a second seeded stream,
 * so the main stream is consumed identically whatever is chosen, and a match
 * is fully determined by its seed plus the list of decisions.
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

type OnPitch = { slotPosition: Position; player: EnginePlayer; yellow: boolean; sentOff: boolean; minuteOn: number; minuteOff: number | null; stamina: number };

/** Strength multipliers from touchline shouts (matchday mode). */
type Mods = { attack: number; defence: number; midfield: number; chances: number };
const NO_MODS: Mods = { attack: 1, defence: 1, midfield: 1, chances: 1 };

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
const effBase = (p: OnPitch) => effectiveRating({ slotPosition: p.slotPosition, cardPosition: p.player.position, overall: p.player.overall });
const active = (t: Live) => t.pitch.filter((p) => !p.sentOff);

function strengths(t: Live, homeBonusPct: number, fatigue = false, mods: Mods = NO_MODS) {
  const on = active(t);
  // Matchday mode: tired players play below their rating (down to 85% when exhausted).
  const eff = fatigue ? (p: OnPitch) => effBase(p) * (0.85 + (0.15 * p.stamina) / 100) : effBase;
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
    attack: attackScore * m * tac.attack * mods.attack,
    midfield: midScore * m * mods.midfield,
    defence: (0.8 * defenceScore + 0.2 * gkScore) * m * tac.defence * mods.defence,
    gk: gkScore * m,
    chanceMultiplier: tac.chances * mods.chances,
  };
}

function initLive(side: Side, sheet: TeamSheet, rng: Rng): Live {
  const pitch = sheet.starters.map((s) => ({ slotPosition: s.slotPosition, player: s.player, yellow: false, sentOff: false, minuteOn: 0, minuteOff: null, stamina: 100 }));
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

/** Thrown inside the loop when the next key moment has no decision yet. */
class PendingMoment {
  constructor(readonly moment: KeyMoment) {}
}
/** Thrown when a matchday chunk reaches the minute the server has revealed so far. */
class PausedAt {
  constructor(readonly minute: number) {}
}
const eff = effBase;
const MAX_SUBS = 5;

const TEAM_TALK: KeyMoment["options"] = [
  { id: "balanced", label: "Keep it balanced", hint: "No change in approach" },
  { id: "attacking", label: "Go out and attack", hint: "More chances for both sides" },
  { id: "defensive", label: "Stay compact", hint: "Tighter at the back, fewer chances" },
];

/** A whole match. For interactive matches every decision must be supplied. */
export function simulateMatch(input: MatchInput, decisions: readonly string[] = [], orders: readonly MatchOrder[] = []): MatchResult {
  const step = playMatch(input, decisions, { orders });
  if (!step.done) throw new Error("PENDING_DECISION");
  return step.result;
}

/**
 * Advances a match with the decisions made so far. Without `input.keyMoments` this is the classic
 * simulation and never pauses. With it, the home manager decides at up to six key moments: the
 * half-time team talk, a late call at 75', up to three big chances and possibly a penalty.
 */
export function playMatch(
  input: MatchInput,
  decisions: readonly string[] = [],
  opts: { orders?: readonly MatchOrder[]; untilMinute?: number } = {},
): LiveStep {
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

  /* ------------------------------------------------------------ key moments */
  const interactive = Boolean(input.keyMoments || input.matchday);
  const matchday = Boolean(input.matchday);
  const orders = matchday ? opts.orders ?? [] : [];
  const untilMinute = matchday ? opts.untilMinute ?? 90 : 90;
  let orderIndex = 0, subsUsed = 0, currentMinute = 0;
  let shout: { value: "press" | "possession"; until: number } | null = null;
  let shoutReadyAt = 0;
  const possession: { minute: number; side: Side }[] = [];
  const pressingAt = (minute: number) => shout !== null && shout.value === "press" && minute <= shout.until;
  const homeMods = (minute: number): Mods =>
    !shout || minute > shout.until
      ? NO_MODS
      : shout.value === "press"
        ? { attack: 1.04, defence: 1.03, midfield: 1, chances: 1.03 }
        : { attack: 0.98, defence: 1.02, midfield: 1.06, chances: 0.95 };
  const homeState = (): HomeState => ({
    tactic: home.sheet.tactic,
    onPitch: active(home).map((p) => ({ id: p.player.id, name: p.player.name, position: p.slotPosition, overall: p.player.overall, stamina: Math.round(p.stamina), yellow: p.yellow })),
    bench: home.bench.map((b) => ({ id: b.id, name: b.name, position: b.position, overall: b.overall })),
    subsLeft: matchday ? MAX_SUBS - subsUsed : 0,
    shout: shout && currentMinute <= shout.until ? { ...shout } : null,
    shoutReadyAt,
  });
  /** Touchline orders given before `minute` take effect now (matchday mode). */
  const applyOrders = (minute: number) => {
    while (orderIndex < orders.length && orders[orderIndex].minute < minute) {
      const o = orders[orderIndex++];
      if (o.kind === "tactic") setTactic(home, o.value);
      else if (o.kind === "shout") {
        if (o.minute >= shoutReadyAt) {
          shout = { value: o.value, until: o.minute + 10 };
          shoutReadyAt = o.minute + 15;
        }
      } else if (o.kind === "sub" && subsUsed < MAX_SUBS) {
        const off = active(home).find((p) => p.player.id === o.off);
        const onIndex = home.bench.findIndex((b) => b.id === o.on);
        if (!off || onIndex < 0) continue;
        const best = home.bench.splice(onIndex, 1)[0];
        off.minuteOff = minute;
        const replacement: OnPitch = { slotPosition: off.slotPosition, player: best, yellow: false, sentOff: false, minuteOn: minute, minuteOff: null, stamina: 100 };
        home.pitch[home.pitch.indexOf(off)] = replacement;
        home.played.set(best, replacement);
        subsUsed++;
        push({ minute, type: "substitution", side: "home", playerId: best.id, playerName: best.name, assistId: off.player.id, assistName: off.player.name, detail: `${best.name} replaces ${off.player.name}` });
      }
    }
  };
  const mrng = new Rng((input.seed ^ 0x2545f491) >>> 0); // decision outcomes only
  const penaltyMinute = interactive && mrng.chance(0.4) ? mrng.int(50, 86) : null;
  let momentIndex = 0, chanceMoments = 0, penaltyTaken = false, lateCallDone = false, lastChanceMoment = -99;
  // Chance moments are spread over the match: not before these minutes, and 15+ minutes apart.
  const CHANCE_MOMENT_FROM = [8, 25, 50];

  const ask = (m: Omit<KeyMoment, "index">): string => {
    const index = momentIndex++;
    if (index >= decisions.length) throw new PendingMoment({ ...m, index });
    const choice = decisions[index];
    if (!m.options.some((o) => o.id === choice)) throw new Error("INVALID_DECISION");
    return choice;
  };
  const setTactic = (t: Live, tactic: Tactic) => {
    t.sheet = { ...t.sheet, tactic };
  };

  /** A home shot created at a key moment, resolved with the decision stream. */
  const homeShot = (minute: number, sh: OnPitch, q: number, assister: OnPitch | undefined) => {
    const sH = strengths(home, input.homeBonusPct, matchday, homeMods(minute)), sA = strengths(away, input.homeBonusPct, matchday);
    if (!mrng.chance(TUNING.onTargetBase + q * TUNING.onTargetQuality)) {
      push({ minute, type: "chance", side: "home", playerId: sh.player.id, playerName: sh.player.name, detail: "Shot off target" });
      return;
    }
    home.stats.shotsOnTarget++;
    const finishing = 0.5 * sh.player.shooting + 0.5 * sH.attack;
    const pGoal = Math.max(0.02, Math.min(0.9, q * TUNING.goalFactor * Math.pow(finishing / Math.max(1, sA.gk), TUNING.goalExponent)));
    if (mrng.chance(pGoal)) {
      score.home++;
      goals.set(sh.player, (goals.get(sh.player) ?? 0) + 1);
      if (assister) assists.set(assister.player, (assists.get(assister.player) ?? 0) + 1);
      push({
        minute, type: "goal", side: "home",
        playerId: sh.player.id, playerName: sh.player.name,
        assistId: assister?.player.id ?? null, assistName: assister?.player.name ?? null,
        detail: `${score.home}–${score.away}`,
      });
    } else {
      away.stats.saves++;
      const keeper = active(away).find((p) => p.slotPosition === "GK");
      push({ minute, type: "save", side: "away", playerId: keeper?.player.id ?? null, playerName: keeper?.player.name ?? null, detail: `Denies ${sh.player.name}` });
    }
  };

  const resolveChance = (minute: number, choice: string, shooter: OnPitch, mate: OnPitch | undefined, q: number) => {
    if (choice === "pass" && mate) {
      if (mrng.chance(Math.max(0.05, 0.42 - shooter.player.passing / 250))) {
        push({ minute, type: "chance", side: "home", playerId: shooter.player.id, playerName: shooter.player.name, detail: "Pass intercepted" });
      } else {
        homeShot(minute, mate, Math.min(0.75, q + 0.15), shooter);
      }
    } else if (choice === "dribble") {
      if (mrng.chance(Math.max(0.25, Math.min(0.85, 0.2 + shooter.player.dribbling / 160)))) {
        homeShot(minute, shooter, Math.min(0.8, q + 0.25), undefined);
      } else {
        push({ minute, type: "chance", side: "home", playerId: shooter.player.id, playerName: shooter.player.name, detail: "Tackled" });
      }
    } else {
      homeShot(minute, shooter, q, undefined);
    }
  };

  const resolvePenalty = (minute: number, corner: string, taker: OnPitch) => {
    home.stats.shots++;
    home.stats.xg += 0.76;
    const dive = mrng.weighted(["left", "centre", "right"], (d) => (d === "centre" ? 0.16 : 0.42));
    const keeper = active(away).find((p) => p.slotPosition === "GK");
    const gk = keeper ? eff(keeper) : 30;
    if (dive === corner && mrng.chance(Math.max(0.4, Math.min(0.85, 0.7 + (gk - 60) / 200)))) {
      home.stats.shotsOnTarget++;
      away.stats.saves++;
      push({ minute, type: "save", side: "away", playerId: keeper?.player.id ?? null, playerName: keeper?.player.name ?? null, detail: `Saves ${taker.player.name}'s penalty` });
      return;
    }
    if (dive !== corner && mrng.chance(Math.max(0.03, (100 - taker.player.shooting) / 300))) {
      push({ minute, type: "chance", side: "home", playerId: taker.player.id, playerName: taker.player.name, detail: "Penalty missed" });
      return;
    }
    home.stats.shotsOnTarget++;
    score.home++;
    goals.set(taker.player, (goals.get(taker.player) ?? 0) + 1);
    push({ minute, type: "goal", side: "home", playerId: taker.player.id, playerName: taker.player.name, detail: `${score.home}–${score.away} (pen)` });
  };

  push({ minute: 0, type: "kickoff", side: null, detail: `${input.home.name} vs ${input.away.name}` });

  const firstHalfStoppage = rng.int(0, 2);
  const secondHalfStoppage = rng.int(1, 5);
  const minutes = [
    ...Array.from({ length: 45 + firstHalfStoppage }, (_, i) => Math.min(i + 1, 45)),
    -1, // half time marker
    ...Array.from({ length: 45 + secondHalfStoppage }, (_, i) => Math.min(46 + i, 90)),
  ];

  try {
    for (const minute of minutes) {
      if (minute === -1) {
        push({ minute: 45, type: "half_time", side: null, detail: `${score.home}–${score.away}` });
        if (interactive) {
          const talk = ask({
            kind: "team_talk", minute: 45, title: "Half-time team talk",
            context: `${input.home.name} ${score.home}–${score.away} ${input.away.name}. How should your team play the second half?`,
            options: TEAM_TALK,
          });
          setTactic(home, talk as Tactic);
        }
        continue;
      }

      if (matchday) {
        applyOrders(minute);
        if (minute > untilMinute) throw new PausedAt(untilMinute);
      }
      currentMinute = minute;

      if (interactive && !matchday && minute === 75 && !lateCallDone) {
        lateCallDone = true;
        const diff = score.home - score.away;
        const call = ask({
          kind: "late_call", minute: 75,
          title: diff > 0 ? "Protect the lead?" : diff === 0 ? "Go for the winner?" : "Chasing the game",
          context: `75' — ${score.home}–${score.away}. Fifteen minutes to go.`,
          options:
            diff > 0
              ? [
                  { id: "defensive", label: "Protect the lead", hint: "Tighter defence, fewer chances" },
                  { id: "balanced", label: "Stay the course", hint: "No change in approach" },
                  { id: "attacking", label: "Go for the next goal", hint: "More chances both ways" },
                ]
              : [
                  { id: "attacking", label: "All-out attack", hint: "More chances both ways" },
                  { id: "balanced", label: "Stay patient", hint: "No change in approach" },
                  { id: "defensive", label: "Stay solid", hint: "Don't concede another" },
                ],
        });
        setTactic(home, call as Tactic);
      }

      // Substitutions (both sides, in fixed order for determinism)
      for (const t of matchday ? [away] : [home, away]) {
        // (In matchday mode the manager makes the home substitutions.)
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
          const replacement: OnPitch = { slotPosition: off.slotPosition, player: best, yellow: false, sentOff: false, minuteOn: minute, minuteOff: null, stamina: 100 };
          t.pitch[t.pitch.indexOf(off)] = replacement;
          t.played.set(best, replacement);
          push({ minute, type: "substitution", side: t.side, playerId: best.id, playerName: best.name, assistId: off.player.id, assistName: off.player.name, detail: `${best.name} replaces ${off.player.name}` });
        }
      }

      const sH = strengths(home, input.homeBonusPct, matchday, homeMods(minute));
      const sA = strengths(away, input.homeBonusPct, matchday);
      const pHome = 1 / (1 + Math.exp(-(sH.midfield - sA.midfield) / TUNING.possessionScale));
      const attSide: Side = rng.chance(pHome) ? "home" : "away";
      const atk = teams[attSide], def = teams[other(attSide)];
      const sAtk = attSide === "home" ? sH : sA, sDef = attSide === "home" ? sA : sH;
      atk.possessionMinutes++;
      if (matchday) possession.push({ minute, side: attSide });

      // Chance creation
      const pChance = TUNING.chancePerMinute * sAtk.chanceMultiplier * Math.pow(sAtk.attack / Math.max(1, sDef.defence), TUNING.chanceExponent);
      if (rng.chance(Math.min(0.45, pChance))) {
        const shooter = rng.weighted(active(atk), (p) => LINE_SHOT_WEIGHT[LINE_OF[p.slotPosition]] * p.player.shooting);
        const quality = 0.03 + Math.pow(rng.next(), 1.6) * 0.5; // xG of the chance
        atk.stats.shots++;
        atk.stats.xg += quality;
        if (
          interactive && attSide === "home" && shooter && quality >= 0.12 && chanceMoments < 3 &&
          minute >= CHANCE_MOMENT_FROM[chanceMoments] && minute - lastChanceMoment >= 15
        ) {
          // Key moment: the manager decides how to finish the move.
          chanceMoments++;
          lastChanceMoment = minute;
          const mate = [...active(atk)]
            .filter((p) => p !== shooter && LINE_OF[p.slotPosition] !== "GK")
            .sort((a, b) => b.player.shooting - a.player.shooting || a.player.name.localeCompare(b.player.name))[0];
          const choice = ask({
            kind: "chance", minute,
            title: quality > 0.3 ? "Huge chance!" : "Chance on the edge of the box",
            context: `${shooter.player.name} (${shooter.slotPosition}) has the ball with a defender closing in.`,
            options: [
              { id: "shoot", label: `Shoot — ${shooter.player.name}`, hint: `Shooting ${shooter.player.shooting}` },
              ...(mate ? [{ id: "pass", label: `Square it to ${mate.player.name}`, hint: `Passing ${shooter.player.passing} → shooting ${mate.player.shooting}` }] : []),
              { id: "dribble", label: "Take on the defender", hint: `Dribbling ${shooter.player.dribbling}` },
            ],
          });
          resolveChance(minute, choice, shooter, mate, quality);
        } else if (shooter && rng.chance(TUNING.onTargetBase + quality * TUNING.onTargetQuality)) {
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

      // Fatigue (matchday mode): everyone tires; pressing tires the home side faster.
      if (matchday) {
        for (const t of [home, away]) {
          const pressing = t === home && pressingAt(minute);
          for (const p of active(t)) p.stamina = Math.max(0, p.stamina - (0.55 + (100 - p.player.physicality) / 180) * (pressing ? 1.5 : 1));
        }
      }

      // Penalty for the home side (interactive matches only, at most once).
      if (interactive && minute === penaltyMinute && !penaltyTaken) {
        penaltyTaken = true;
        const taker = [...active(home)]
          .filter((p) => p.slotPosition !== "GK")
          .sort((a, b) => b.player.shooting - a.player.shooting || a.player.name.localeCompare(b.player.name))[0];
        if (taker) {
          const corner = ask({
            kind: "penalty", minute, title: "Penalty!",
            context: `Foul in the box! ${taker.player.name} (shooting ${taker.player.shooting}) takes it. Pick the spot.`,
            options: [
              { id: "left", label: "Bottom left", hint: "Keepers often dive this way" },
              { id: "centre", label: "Down the middle", hint: "Bold — keepers rarely stay put" },
              { id: "right", label: "Bottom right", hint: "Keepers often dive this way" },
            ],
          });
          resolvePenalty(minute, corner, taker);
        }
      }
    }
  } catch (e) {
    if (e instanceof PendingMoment) {
      return { done: false, events: events.slice(), score: { ...score }, moment: e.moment, minute: e.moment.minute, home: homeState(), possession: possession.slice() };
    }
    if (e instanceof PausedAt) {
      return { done: false, events: events.slice(), score: { ...score }, moment: null, minute: e.minute, home: homeState(), possession: possession.slice() };
    }
    throw e;
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

  const result: MatchResult = { engineVersion: ENGINE_VERSION, score, events, stats: { home: home.stats, away: away.stats }, ratings, manOfTheMatch };
  return { done: true, result };
}
