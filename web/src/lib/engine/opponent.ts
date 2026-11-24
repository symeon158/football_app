import type { Position } from "@/lib/game/team-rating";

import { Rng } from "./rng";
import type { Difficulty, EnginePlayer, Formation, Tactic, TeamSheet } from "./types";

/** Opponent rating relative to the player's team, per difficulty. */
export const DIFFICULTY_OFFSET: Record<Difficulty, number> = { easy: -5, normal: 0, hard: 5 };

const CLUBS = [
  "Harbour City", "Ironvale United", "Redmoor Town", "Saltmarsh Wanderers", "Kestrel Bay FC", "Ashford Albion",
  "Port Lumen", "Granite Hill Rovers", "Valdorne Sporting", "Westgate Athletic", "Cobalt Rangers", "Thornbury County",
  "Sunfield Rovers", "Marlow Celtic", "Brightwater FC", "Old Quarry United",
];
const FIRST = ["Leo", "Marco", "Tomas", "Ilias", "Kofi", "Jonas", "Ruben", "Sami", "Arno", "Dario", "Nico", "Elias", "Joao", "Kenji", "Omar", "Felix"];
const LAST = ["Arden", "Brask", "Corvo", "Dunmore", "Elstrand", "Farrow", "Galen", "Holm", "Ivers", "Juno", "Kesler", "Lorne", "Mavros", "Norell", "Oakes", "Pryce"];

/** Stat shape per position (offsets from overall). */
const SHAPE: Record<Position, [number, number, number, number, number, number]> = {
  GK: [-15, -40, -10, -20, -10, 0],
  CB: [-8, -30, -10, -15, 6, 6],
  LB: [4, -20, -2, -2, 0, -2],
  RB: [4, -20, -2, -2, 0, -2],
  CDM: [-6, -12, 2, -4, 5, 5],
  CM: [-3, -4, 5, 2, -6, 0],
  CAM: [0, 3, 5, 6, -25, -6],
  LM: [5, -2, 2, 4, -18, -6],
  RM: [5, -2, 2, 4, -18, -6],
  LW: [7, 2, -1, 6, -30, -8],
  RW: [7, 2, -1, 6, -30, -8],
  ST: [3, 7, -6, 2, -35, 2],
};

const clamp = (v: number) => Math.max(20, Math.min(99, Math.round(v)));

/** Unique within one squad, so timelines never read "X, assisted by X". */
function uniqueName(rng: Rng, used: Set<string>): string {
  for (;;) {
    const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

function makePlayer(rng: Rng, position: Position, overall: number, used: Set<string>): EnginePlayer {
  const s = SHAPE[position];
  const n = () => rng.int(-3, 3);
  return {
    id: null,
    name: uniqueName(rng, used),
    position,
    overall: clamp(overall),
    pace: clamp(overall + s[0] + n()),
    shooting: clamp(overall + s[1] + n()),
    passing: clamp(overall + s[2] + n()),
    dribbling: clamp(overall + s[3] + n()),
    defending: clamp(overall + s[4] + n()),
    physicality: clamp(overall + s[5] + n()),
  };
}

const FORMATION_POSITIONS: Record<Formation, Position[]> = {
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LM", "CM", "CDM", "CM", "RM", "ST", "ST"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LW", "CAM", "RW", "ST"],
};

/**
 * A generated AI opponent around `targetRating`, fully determined by the
 * seed (so a stored match can be replayed exactly). Uses its own RNG stream
 * so it never shifts the match engine's random numbers.
 */
export function generateOpponent(seed: number, targetRating: number): TeamSheet {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const formation = rng.pick(Object.keys(FORMATION_POSITIONS) as Formation[]);
  const tactic: Tactic = rng.pick(["balanced", "balanced", "attacking", "defensive"] as const);
  const target = Math.max(40, Math.min(95, Math.round(targetRating)));
  const used = new Set<string>();
  const starters = FORMATION_POSITIONS[formation].map((position) => ({
    slotPosition: position,
    player: makePlayer(rng, position, target + rng.int(-4, 4), used),
  }));
  const bench = (["GK", "CB", "CM", "LW", "ST"] as Position[]).map((p) => makePlayer(rng, p, target - rng.int(2, 6), used));
  return { name: rng.pick(CLUBS), formation, tactic, chemistry: rng.int(45, 80), captainId: null, starters, bench };
}
