import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Fn = Database["public"]["Functions"];
export type ChallengeRow = Fn["get_challenges"]["Returns"][number];
export type AchievementRow = Fn["get_achievements"]["Returns"][number];
export type LeaderboardRow = Fn["get_leaderboard"]["Returns"][number];

/** Live progress, derived in the database from matches/cards/stadium/squads. */
export async function getChallenges(): Promise<ChallengeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_challenges");
  if (error) throw new Error(`Failed to load challenges: ${error.message}`);
  return data ?? [];
}

export async function getAchievements(): Promise<AchievementRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_achievements");
  if (error) throw new Error(`Failed to load achievements: ${error.message}`);
  return data ?? [];
}

export const BOARDS = {
  level: { label: "Manager level", unit: "XP", weekly: false },
  wins: { label: "Wins", unit: "wins", weekly: true },
  goals: { label: "Goals", unit: "goals", weekly: true },
  team_rating: { label: "Team rating", unit: "rating", weekly: false },
  club_value: { label: "Club value", unit: "FC", weekly: false },
} as const;
export type Board = keyof typeof BOARDS;

export async function getLeaderboard(board: Board, period: "all" | "week", limit = 50): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_leaderboard", { p_board: board, p_period: period, p_limit: limit });
  if (error) throw new Error(`Failed to load leaderboard: ${error.message}`);
  return data ?? [];
}

export type ManagerProfile = {
  username: string;
  display_name: string | null;
  avatar_key: string;
  level: number;
  xp: number;
  member_since: string;
  is_me: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals: number;
  cards: number;
  club_value: number;
  best_team_rating: number;
  team: { name: string; logo_template: string; primary_color: string; secondary_color: string; overall: number; formation: string } | null;
  stadium: { name: string; level: number; capacity: number; design: string } | null;
  badges: { code: string; title: string; badge_icon: string; claimed_at: string }[];
};

/** Public, game-only profile (no e-mail or private data) — any manager by username. */
export async function getManagerProfile(username: string): Promise<ManagerProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_manager_profile", { p_username: username });
  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  return (data as ManagerProfile | null) ?? null;
}
