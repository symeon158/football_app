import type { Database } from "@/types/database";

export type Position = Database["public"]["Enums"]["player_position"];

export type Starter = {
  slotPosition: Position; // position the formation slot asks for
  cardPosition: Position; // card's natural position
  overall: number;
};

/** Positions a player can cover with only a small penalty. */
export const RELATED: Record<Position, Position[]> = {
  GK: [],
  CB: ["CDM"],
  LB: ["LM", "CB"],
  RB: ["RM", "CB"],
  CDM: ["CM", "CB"],
  CM: ["CDM", "CAM"],
  CAM: ["CM", "ST"],
  LM: ["LW", "LB", "CM"],
  RM: ["RW", "RB", "CM"],
  LW: ["LM", "ST"],
  RW: ["RM", "ST"],
  ST: ["CAM", "LW", "RW"],
};

/**
 * Effective rating of a player in a slot:
 *  natural position → 100 %, related → 90 %, GK↔outfield → 30 %, otherwise 75 %.
 */
export function effectiveRating(s: Starter): number {
  if (s.slotPosition === s.cardPosition) return s.overall;
  if (s.slotPosition === "GK" || s.cardPosition === "GK") return Math.round(s.overall * 0.3);
  if (RELATED[s.slotPosition].includes(s.cardPosition)) return Math.round(s.overall * 0.9);
  return Math.round(s.overall * 0.75);
}

/**
 * Team overall = mean effective rating of the starting XI. Empty slots count
 * as 0, so an incomplete team is visibly weaker. Returns 0 for no starters.
 */
export function teamOverall(starters: Starter[], teamSize = 11): number {
  if (starters.length === 0) return 0;
  const total = starters.slice(0, teamSize).reduce((sum, s) => sum + effectiveRating(s), 0);
  return Math.round(total / teamSize);
}
