import "server-only";

import { periodEnd, periodStart, type ChallengePeriod } from "@/lib/game/periods";
import { teamOverall, type Position } from "@/lib/game/team-rating";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
export type StadiumCategory = Database["public"]["Enums"]["stadium_upgrade_category"];

const CARD_FIELDS =
  "id, rarity, position, overall, pace, shooting, passing, dribbling, defending, physicality, player:players!inner(first_name, last_name, known_as, nationality, club)";

/**
 * Everything the dashboard needs, fetched in parallel as the signed-in user
 * (RLS-scoped). `now` is injected so the period logic stays testable.
 */
export async function getDashboard(userId: string, now: Date) {
  const supabase = await createClient();
  const today = periodStart("daily", now);
  const week = periodStart("weekly", now);

  const [team, slots, latest, cardCount, rareCount, matches, challenges, progress, stadium, costs] =
    await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, name, formation, tactic, logo_template, primary_color, secondary_color, team_players(slot, ownership:card_ownership!inner(card:player_cards!inner(position, overall)))",
        )
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase.from("formation_slots").select("formation, slot, position"),
      supabase
        .from("card_ownership")
        .select(`id, acquired_at, card:player_cards!inner(${CARD_FIELDS})`)
        .eq("user_id", userId)
        .order("acquired_at", { ascending: false })
        .order("id")
        .limit(6),
      supabase.from("card_ownership").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase
        .from("card_ownership")
        .select("id, card:player_cards!inner(rarity)", { count: "exact", head: true })
        .eq("user_id", userId)
        .neq("card.rarity", "common"),
      supabase
        .from("matches")
        .select("id, opponent_name, opponent_rating, home_score, away_score, reward_coins, completed_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(5),
      supabase
        .from("challenges")
        .select("id, code, title, description, period, target, reward_coins, reward_xp")
        .in("period", ["daily", "weekly"])
        .order("period")
        .order("reward_coins"),
      supabase
        .from("user_challenges")
        .select("challenge_id, period_start, progress, completed_at, claimed_at")
        .eq("user_id", userId)
        .in("period_start", [today, week]),
      supabase
        .from("stadiums")
        .select("name, design_template, capacity, stadium_level, seating_level, lighting_level, pitch_level, facilities_level")
        .eq("user_id", userId)
        .single(),
      supabase.from("stadium_upgrade_costs").select("category, level, cost, description"),
    ]);

  const failed = [team, slots, latest, cardCount, rareCount, matches, challenges, progress, stadium, costs].find(
    (r) => r.error,
  );
  if (failed?.error) throw new Error(`Failed to load dashboard: ${failed.error.message}`);

  // --- Team rating -----------------------------------------------------------
  const slotPositions = new Map(
    (slots.data ?? [])
      .filter((s) => s.formation === team.data?.formation)
      .map((s) => [s.slot, s.position as Position]),
  );
  const starters = (team.data?.team_players ?? [])
    .filter((tp) => tp.slot <= 10 && slotPositions.has(tp.slot))
    .map((tp) => ({
      slotPosition: slotPositions.get(tp.slot)!,
      cardPosition: tp.ownership.card.position,
      overall: tp.ownership.card.overall,
    }));

  // --- Challenges ------------------------------------------------------------
  const progressByKey = new Map(
    (progress.data ?? []).map((p) => [`${p.challenge_id}:${p.period_start}`, p]),
  );
  const challengeList = (challenges.data ?? []).map((c) => {
    const period = c.period as ChallengePeriod;
    const p = progressByKey.get(`${c.id}:${periodStart(period, now)}`);
    return {
      ...c,
      period,
      progress: Math.min(p?.progress ?? 0, c.target),
      completed: Boolean(p?.completed_at),
      claimed: Boolean(p?.claimed_at),
      endsAt: periodEnd(period, now),
    };
  });
  // Unfinished first, then by period (daily before weekly).
  challengeList.sort((a, b) => Number(a.completed) - Number(b.completed));

  // --- Stadium ---------------------------------------------------------------
  const s = stadium.data!;
  const levels: Record<StadiumCategory, number> = {
    seating: s.seating_level,
    lighting: s.lighting_level,
    pitch: s.pitch_level,
    facilities: s.facilities_level,
  };
  const nextUpgrades = (Object.keys(levels) as StadiumCategory[]).map((category) => {
    const next = (costs.data ?? []).find((c) => c.category === category && c.level === levels[category] + 1);
    return { category, level: levels[category], nextCost: next?.cost ?? null, nextDescription: next?.description ?? null };
  });

  return {
    team: team.data
      ? {
          id: team.data.id,
          name: team.data.name,
          formation: team.data.formation,
          tactic: team.data.tactic,
          logoTemplate: team.data.logo_template,
          primaryColor: team.data.primary_color,
          secondaryColor: team.data.secondary_color,
          overall: teamOverall(starters),
          startersFilled: starters.length,
        }
      : null,
    latestCards: (latest.data ?? []).map((o) => ({ ownershipId: o.id, acquiredAt: o.acquired_at, ...o.card })),
    collection: { total: cardCount.count ?? 0, special: rareCount.count ?? 0 },
    matches: (matches.data ?? []) as Pick<
      Tables["matches"]["Row"],
      "id" | "opponent_name" | "opponent_rating" | "home_score" | "away_score" | "reward_coins" | "completed_at"
    >[],
    challenges: challengeList.slice(0, 4),
    stadium: {
      name: s.name,
      design: s.design_template,
      capacity: s.capacity ?? 0,
      level: s.stadium_level ?? 1,
      upgrades: nextUpgrades,
    },
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
export type DashboardCard = Dashboard["latestCards"][number];
