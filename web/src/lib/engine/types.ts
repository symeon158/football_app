import type { Position } from "@/lib/game/team-rating";

export const ENGINE_VERSION = "1.0.0";

export type Side = "home" | "away";
export type Tactic = "balanced" | "attacking" | "defensive";
export type Difficulty = "easy" | "normal" | "hard";
export type Formation = "4-3-3" | "4-4-2" | "3-5-2" | "4-2-3-1";

/** One player as the engine sees them (a snapshot, so replays never depend on live data). */
export type EnginePlayer = {
  id: string | null; // card ownership id for the user's players; null for generated opponents
  name: string;
  position: Position; // the card's natural position
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physicality: number;
};

export type TeamSheet = {
  name: string;
  formation: Formation;
  tactic: Tactic;
  chemistry: number; // 0–100
  captainId: string | null;
  /** 11 entries in formation-slot order, each with the slot's required position. */
  starters: { slotPosition: Position; player: EnginePlayer }[];
  bench: EnginePlayer[];
};

export type MatchInput = {
  seed: number;
  home: TeamSheet;
  away: TeamSheet;
  homeBonusPct: number; // stadium home advantage, 0–15
};

export type EventType = "kickoff" | "goal" | "chance" | "save" | "yellow_card" | "red_card" | "substitution" | "half_time" | "full_time";

export type MatchEvent = {
  minute: number;
  type: EventType;
  side: Side | null;
  playerId: string | null;
  playerName: string | null;
  assistId: string | null; // for substitutions: the player going off
  assistName: string | null;
  detail: string | null;
};

export type TeamStats = {
  possession: number; // %
  shots: number;
  shotsOnTarget: number;
  xg: number;
  yellowCards: number;
  redCards: number;
  saves: number;
};

export type PlayerRating = { side: Side; id: string | null; name: string; position: Position; rating: number; goals: number; assists: number };

export type MatchResult = {
  engineVersion: string;
  score: { home: number; away: number };
  events: MatchEvent[];
  stats: { home: TeamStats; away: TeamStats };
  ratings: PlayerRating[];
  manOfTheMatch: PlayerRating | null;
};
