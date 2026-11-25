import type { Position } from "@/lib/game/team-rating";

/** Pitch in metres. x runs along the length (home attacks +x), y across the width. */
export const PITCH = { length: 105, width: 68, goalWidth: 7.32, goalDepth: 2 } as const;
/** Simulation rate. The sim is advanced in fixed steps so a match replays identically. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;
/** Real seconds per half (the on-screen clock shows 0–45'). */
export const HALF_SECONDS = 180;

export type TeamIndex = 0 | 1; // 0 = home (the human), 1 = away (computer)

export type PlayStats = {
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physicality: number;
};

/** Everything needed to start a match (serialisable; also what a server replay would need). */
export type PlaySetup = {
  seed: number;
  teams: [PlayTeamSetup, PlayTeamSetup];
};

export type PlayTeamSetup = {
  name: string;
  short: string; // 3-letter code for the scoreboard
  kit: { primary: string; secondary: string };
  /** 11 starters in formation-slot order; slot x/y are the formation grid (0–100). */
  players: { name: string; role: Position; slotX: number; slotY: number; stats: PlayStats }[];
};

/** One tick of human input. Button "pressed" flags are true only on the tick the button went down. */
export type PlayInput = {
  moveX: number; // -1..1
  moveY: number; // -1..1 (positive = down the screen = +y)
  sprint: boolean;
  pass: boolean;
  through: boolean;
  shootHeld: boolean; // hold to charge, release to shoot; without the ball a press tackles
  switchPlayer: boolean;
};

export const NO_INPUT: PlayInput = { moveX: 0, moveY: 0, sprint: false, pass: false, through: false, shootHeld: false, switchPlayer: false };

export type PlayerState = {
  id: number; // 0–10 home, 11–21 away
  team: TeamIndex;
  role: Position;
  name: string;
  stats: PlayStats;
  baseX: number; // formation position with the ball at the centre spot
  baseY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number; // facing (unit vector)
  fy: number;
  stun: number; // seconds unable to act
  kickCooldown: number; // seconds before this player may touch the ball again
  tackleCooldown: number;
  decision: number; // AI: seconds until the next decision
};

export type Phase = "kickoff" | "play" | "goal" | "restart" | "halftime" | "fulltime";

export type GoalEvent = { team: TeamIndex; scorer: string; minute: number };

export type BallState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number | null; // player id in possession
  lastTouch: TeamIndex | null;
  lastKicker: number | null;
  intendedFor: number | null; // pass receiver (auto-switch target)
};

export type MatchState = {
  tick: number;
  half: 1 | 2;
  clock: number; // seconds of play elapsed in this half
  phase: Phase;
  phaseTimer: number;
  kickoffTeam: TeamIndex;
  restart: { team: TeamIndex; x: number; y: number; kind: "throw-in" | "corner" | "goal-kick" } | null;
  score: [number, number];
  goals: GoalEvent[];
  players: PlayerState[];
  ball: BallState;
  controlled: number; // id of the home player the human controls
  charge: number; // 0–1 shot power while the shoot button is held
  shootWasHeld: boolean; // previous tick's shoot button (for press/release edges)
  rngState: number;
  setup: PlaySetup;
};
