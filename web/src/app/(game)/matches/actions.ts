"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getFormations, getSquadCards, getSquads } from "@/lib/data/team";
import { getStadium } from "@/lib/data/stadium";
import { DIFFICULTY_OFFSET, generateOpponent } from "@/lib/engine/opponent";
import { randomSeed } from "@/lib/engine/rng";
import { simulateMatch } from "@/lib/engine/simulate";
import { buildTeamSheet } from "@/lib/engine/team-sheet";
import { ENGINE_VERSION } from "@/lib/engine/types";
import { toUserMessage } from "@/lib/errors";
import { homeBonus } from "@/lib/game/stadium";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/supabase/server";
import { idempotencyKeySchema } from "@/lib/validation/market";

export type KickoffState = { ok: boolean; message?: string };

const kickoffSchema = z.object({
  teamId: z.uuid(),
  tactic: z.enum(["balanced", "attacking", "defensive"]),
  difficulty: z.enum(["easy", "normal", "hard"]),
  key: idempotencyKeySchema,
});

/**
 * Plays a match. Trust boundary:
 *  1. The user is identified from the verified session (never from input).
 *  2. Their squad, cards and stadium are read through RLS (their own data).
 *  3. The engine runs HERE, with a server-generated seed.
 *  4. The result is stored by record_match(), which only the service role can
 *     execute; the database computes rewards, enforces cooldown/daily caps and
 *     idempotency. Users can never submit a score.
 */
export async function kickOff(_prev: KickoffState, form: FormData): Promise<KickoffState> {
  const parsed = kickoffSchema.safeParse({
    teamId: form.get("teamId"),
    tactic: form.get("tactic"),
    difficulty: form.get("difficulty"),
    key: form.get("key"),
  });
  if (!parsed.success) return { ok: false, message: "Choose a tactic and difficulty, then try again." };
  const userId = await getUserId();
  if (!userId) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const { teamId, tactic, difficulty, key } = parsed.data;

  const [squads, formations, cards, stadium] = await Promise.all([getSquads(userId), getFormations(), getSquadCards(userId), getStadium(userId)]);
  const squad = squads.find((s) => s.id === teamId);
  if (!squad) return { ok: false, message: toUserMessage({ message: "TEAM_NOT_FOUND" }) };

  const built = buildTeamSheet(squad, formations[squad.formation] ?? [], cards, tactic);
  if (!built.ok) return { ok: false, message: `Fill all 11 starting places first (${built.missing} empty).` };

  const seed = randomSeed();
  const opponentRating = built.overall + DIFFICULTY_OFFSET[difficulty];
  const away = generateOpponent(seed, opponentRating);
  const homeBonusPct = homeBonus(stadium.levels, stadium.costs);
  const input = { seed, home: built.sheet, away, homeBonusPct };
  const result = simulateMatch(input);

  const payload = {
    seed,
    engine_version: ENGINE_VERSION,
    tactic,
    difficulty,
    opponent_name: away.name,
    opponent_rating: Math.round(opponentRating),
    home_score: result.score.home,
    away_score: result.score.away,
    // Everything needed to replay and verify the match later.
    team_snapshot: input,
    stats: {
      home: result.stats.home,
      away: result.stats.away,
      ratings: result.ratings,
      manOfTheMatch: result.manOfTheMatch,
      homeOverall: built.overall,
      homeChemistry: built.chemistry,
      homeBonusPct,
      awayFormation: away.formation,
      homeFormation: squad.formation,
    },
    events: result.events.map((e) => ({
      minute: e.minute,
      type: e.type,
      side: e.side,
      player_name: e.playerName,
      assist_player_name: e.assistName,
      ownership_id: e.playerId,
      assist_ownership_id: e.assistId,
      detail: e.detail,
    })),
  };

  const admin = createAdminClient();
  const { data: matchId, error } = await admin.rpc("record_match", {
    p_user_id: userId,
    p_team_id: squad.id,
    p_idempotency_key: key,
    p_payload: payload,
  });
  if (error) return { ok: false, message: toUserMessage(error) };

  // Keep the top bar's coins/XP current. During the live replay the viewer
  // masks them (data-match-live) so the reward doesn't spoil the result.
  refresh();
  redirect(`/matches/${matchId}?live=1`);
}
