import type { HomeState, KeyMoment, LiveStep, Side } from "./types";

/** What the live match screen needs up to the revealed minute (plain, serialisable data). */
export type LiveEvent = {
  minute: number;
  type: string;
  side: "home" | "away" | null;
  player: string | null;
  assist: string | null;
  detail: string | null;
};

export type LiveSegment = {
  events: LiveEvent[];
  score: { home: number; away: number };
  /** The decision being waited for, or null when the match is simply paused at `minute`. */
  moment: KeyMoment | null;
  minute: number;
  home: HomeState;
  possession: { minute: number; side: Side }[];
};

export function liveSegment(step: Extract<LiveStep, { done: false }>): LiveSegment {
  return {
    events: step.events.map((e) => ({ minute: e.minute, type: e.type, side: e.side, player: e.playerName, assist: e.assistName, detail: e.detail })),
    score: step.score,
    moment: step.moment,
    minute: step.minute,
    home: step.home,
    possession: step.possession,
  };
}
