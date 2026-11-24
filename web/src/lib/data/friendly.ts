import "server-only";

import type { BuilderCard, Squad } from "@/lib/data/team";
import type { Formation, Tactic } from "@/lib/engine/types";
import type { Lineup } from "@/lib/game/lineup";
import { toCardData, type CardRow } from "@/lib/game/player";
import type { Rarity } from "@/lib/game/rarity";
import type { Position } from "@/lib/game/team-rating";
import { createClient } from "@/lib/supabase/server";

type OpponentPlayer = CardRow & {
  slot: number;
  ownership_id: string;
  player_id: string;
  display_name: string | null;
  position: Position;
  overall: number;
  rarity: Rarity;
  nationality: string;
  club: string;
};

type OpponentPayload = {
  user_id: string;
  username: string;
  display_name: string | null;
  level: number;
  team: {
    id: string;
    name: string;
    logo_template: string;
    primary_color: string;
    secondary_color: string;
    formation: Formation;
    tactic: Tactic;
    captain_ownership_id: string | null;
    overall: number | null;
    chemistry: number | null;
  } | null;
  players: OpponentPlayer[];
  h2h: { won: number; drawn: number; lost: number };
  rewarded_today: number;
};

/**
 * Another manager's club as a challenger may see it (public profile + active squad),
 * shaped like the viewer's own squad data so the same engine code can build its team sheet.
 * Throws CANNOT_CHALLENGE_SELF for the viewer's own username; null when unknown.
 */
export async function getFriendlyOpponent(username: string) {
  const supabase = await createClient();
  const [{ data, error }, limits] = await Promise.all([
    supabase.rpc("get_friendly_opponent", { p_username: username }),
    supabase.rpc("friendly_limits").single(),
  ]);
  if (error) throw new Error(error.message);
  if (limits.error) throw new Error(`Failed to load limits: ${limits.error.message}`);
  if (!data) return null;
  const o = data as unknown as OpponentPayload;

  const cards: BuilderCard[] = o.players.map((p) => ({
    ownershipId: p.ownership_id,
    playerId: p.player_id,
    name: p.display_name ?? `${p.first_name} ${p.last_name}`,
    position: p.position,
    overall: p.overall,
    club: p.club,
    nationality: p.nationality,
    rarity: p.rarity,
    card: toCardData(p),
  }));

  const squad: Squad | null = o.team
    ? {
        id: o.team.id,
        name: o.team.name,
        logoTemplate: o.team.logo_template,
        primaryColor: o.team.primary_color,
        secondaryColor: o.team.secondary_color,
        formation: o.team.formation,
        tactic: o.team.tactic,
        captain: o.team.captain_ownership_id,
        isActive: true,
        lineup: Object.fromEntries(o.players.map((p) => [p.slot, p.ownership_id])) as Lineup,
      }
    : null;

  return {
    userId: o.user_id,
    username: o.username,
    displayName: o.display_name ?? o.username,
    level: o.level,
    squad,
    cards,
    h2h: o.h2h,
    rewardedLeftVsOpponent: Math.max(0, limits.data.rewarded_per_opponent - o.rewarded_today),
    rewardedPerOpponent: limits.data.rewarded_per_opponent,
  };
}

export type FriendlyOpponent = NonNullable<Awaited<ReturnType<typeof getFriendlyOpponent>>>;

/** Managers the viewer recently challenged, and recent challenges against the viewer's club. */
export async function getChallengeActivity(userId: string) {
  const supabase = await createClient();
  const [mine, against] = await Promise.all([
    supabase
      .from("matches")
      .select("id, home_score, away_score, opponent_name, created_at, opponent:profiles!matches_opponent_user_id_fkey(username, level)")
      .eq("user_id", userId)
      .not("opponent_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("matches")
      .select("id, home_score, away_score, created_at, challenger:profiles!matches_user_id_fkey(username)")
      .eq("opponent_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (mine.error) throw new Error(`Failed to load challenges: ${mine.error.message}`);
  if (against.error) throw new Error(`Failed to load challenges: ${against.error.message}`);

  const seen = new Set<string>();
  const recentOpponents: { username: string; level: number; teamName: string }[] = [];
  for (const m of mine.data ?? []) {
    const u = m.opponent?.username;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    recentOpponents.push({ username: u, level: m.opponent!.level, teamName: m.opponent_name });
    if (recentOpponents.length === 8) break;
  }

  // From the viewer's side: they defended (away), so their result is away vs home.
  const againstMe = (against.data ?? []).map((m) => ({
    id: m.id,
    challenger: m.challenger?.username ?? "A manager",
    myGoals: m.away_score,
    theirGoals: m.home_score,
    createdAt: m.created_at,
  }));

  return { recentOpponents, againstMe };
}
