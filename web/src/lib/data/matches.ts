import "server-only";

import { simulateMatch } from "@/lib/engine/simulate";
import type { MatchInput, PlayerRating, TeamStats } from "@/lib/engine/types";
import { ENGINE_VERSION } from "@/lib/engine/types";
import { buildTeamSheet } from "@/lib/engine/team-sheet";
import { getStadium } from "@/lib/data/stadium";
import { getFormations, getSquadCards, getSquads } from "@/lib/data/team";
import { homeBonus, matchdayIncome } from "@/lib/game/stadium";
import { createClient } from "@/lib/supabase/server";

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Everything the Match Centre needs (all RLS-scoped to the viewer). */
export async function getMatchCentre(userId: string, now: Date) {
  const supabase = await createClient();
  const [squads, formations, cards, stadium, rewards, limits, today, recent, record] = await Promise.all([
    getSquads(userId),
    getFormations(),
    getSquadCards(userId),
    getStadium(userId),
    supabase.rpc("match_rewards"),
    supabase.rpc("match_limits").single(),
    supabase.from("matches").select("rewarded").eq("user_id", userId).gte("created_at", startOfUtcDay(now)),
    supabase
      .from("matches")
      .select("id, opponent_name, home_score, away_score, difficulty, reward_coins, xp_gained, completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(8),
    supabase.from("matches").select("home_score, away_score").eq("user_id", userId).eq("status", "completed"),
  ]);
  for (const r of [rewards, limits, today, recent, record]) if (r.error) throw new Error(`Failed to load Match Centre: ${r.error.message}`);

  const squadViews = squads.map((s) => {
    const built = buildTeamSheet(s, formations[s.formation] ?? [], cards, s.tactic);
    return { ...s, ready: built.ok, missing: built.ok ? 0 : built.missing, overall: built.ok ? built.overall : null, chemistry: built.ok ? built.chemistry : null };
  });

  const totals = (record.data ?? []).reduce(
    (t, m) => ({
      played: t.played + 1,
      won: t.won + (m.home_score > m.away_score ? 1 : 0),
      drawn: t.drawn + (m.home_score === m.away_score ? 1 : 0),
      lost: t.lost + (m.home_score < m.away_score ? 1 : 0),
      goalsFor: t.goalsFor + m.home_score,
      goalsAgainst: t.goalsAgainst + m.away_score,
    }),
    { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 },
  );

  return {
    squads: squadViews,
    rewards: rewards.data ?? [],
    limits: limits.data!,
    today: { played: today.data?.length ?? 0, rewarded: (today.data ?? []).filter((m) => m.rewarded).length },
    stadium: { bonus: homeBonus(stadium.levels, stadium.costs), income: matchdayIncome(stadium.capacity), name: stadium.name },
    recent: recent.data ?? [],
    totals,
  };
}

export type MatchStats = {
  home: TeamStats;
  away: TeamStats;
  ratings: PlayerRating[];
  manOfTheMatch: PlayerRating | null;
  homeOverall: number;
  homeChemistry: number;
  homeBonusPct: number;
  homeFormation: string;
  awayFormation: string;
};

/** One of the viewer's matches with its timeline, plus a replay check. */
export async function getMatch(matchId: string) {
  const supabase = await createClient();
  const [match, events] = await Promise.all([
    supabase
      .from("matches")
      .select("id, team_id, team_snapshot, opponent_name, opponent_rating, tactic, difficulty, seed, engine_version, home_score, away_score, stats, reward_coins, xp_gained, rewarded, completed_at")
      .eq("id", matchId)
      .maybeSingle(),
    supabase
      .from("match_events")
      .select("seq, minute, event_type, side, player_name, assist_player_name, ownership_id, detail")
      .eq("match_id", matchId)
      .order("seq"),
  ]);
  if (match.error) throw new Error(`Failed to load match: ${match.error.message}`);
  if (events.error) throw new Error(`Failed to load match events: ${events.error.message}`);
  if (!match.data) return null;

  const m = match.data;
  const snapshot = m.team_snapshot as unknown as MatchInput;
  const homeName = snapshot?.home?.name ?? "Home";
  return { ...m, homeName, stats: m.stats as unknown as MatchStats, events: events.data ?? [], verification: verifyReplay(m, snapshot, events.data ?? []) };
}

/**
 * Re-simulates the match from its stored seed + team sheets and compares it
 * with what was recorded. Proves results are engine output, reproducible.
 */
function verifyReplay(
  m: { seed: number; engine_version: string; home_score: number; away_score: number },
  snapshot: MatchInput | null,
  events: { event_type: string; minute: number; side: string | null; player_name: string | null }[],
): "verified" | "mismatch" | "other-version" {
  if (!snapshot?.home || !snapshot?.away) return "mismatch";
  if (m.engine_version !== ENGINE_VERSION) return "other-version";
  const replay = simulateMatch({ ...snapshot, seed: Number(m.seed) });
  const same =
    replay.score.home === m.home_score &&
    replay.score.away === m.away_score &&
    replay.events.length === events.length &&
    replay.events.every((e, i) => e.type === events[i].event_type && e.minute === events[i].minute && (e.side ?? null) === events[i].side && (e.playerName ?? null) === events[i].player_name);
  return same ? "verified" : "mismatch";
}

export type MatchView = NonNullable<Awaited<ReturnType<typeof getMatch>>>;
