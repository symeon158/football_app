"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getFriendlyOpponent } from "@/lib/data/friendly";
import { getFormations, getSquadCards, getSquads } from "@/lib/data/team";
import { getStadium } from "@/lib/data/stadium";
import { liveSegment, type LiveSegment } from "@/lib/engine/live";
import { DIFFICULTY_OFFSET, generateOpponent } from "@/lib/engine/opponent";
import { randomSeed } from "@/lib/engine/rng";
import { playMatch } from "@/lib/engine/simulate";
import { buildTeamSheet } from "@/lib/engine/team-sheet";
import { ENGINE_VERSION, type MatchInput, type MatchResult } from "@/lib/engine/types";
import { toUserMessage } from "@/lib/errors";
import { homeBonus } from "@/lib/game/stadium";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUserId } from "@/lib/supabase/server";
import { usernameSchema } from "@/lib/validation/auth";
import { idempotencyKeySchema } from "@/lib/validation/market";

export type KickoffState = { ok: boolean; message?: string };

const kickoffSchema = z.object({
  teamId: z.uuid(),
  tactic: z.enum(["balanced", "attacking", "defensive"]),
  difficulty: z.enum(["easy", "normal", "hard"]),
  key: idempotencyKeySchema,
  opponent: usernameSchema.optional(), // friend match: another manager's username
});

/**
 * Kicks off an interactive match. Trust boundary:
 *  1. The user is identified from the verified session (never from input).
 *  2. Their squad, cards and stadium are read through RLS (their own data).
 *  3. The seed is generated HERE and stored with both team sheets at kick-off
 *     (start_match, service role only), so the match is fixed from this point:
 *     only the manager's decisions at key moments are still open.
 *  4. Results are computed by the server from seed + decisions and settled by
 *     finish_match, which pays rewards. Users can never submit a score.
 */
export async function kickOff(_prev: KickoffState, form: FormData): Promise<KickoffState> {
  const parsed = kickoffSchema.safeParse({
    teamId: form.get("teamId"),
    tactic: form.get("tactic"),
    difficulty: form.get("difficulty"),
    key: form.get("key"),
    opponent: form.get("opponent") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Choose a tactic and difficulty, then try again." };
  const userId = await getUserId();
  if (!userId) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const { teamId, tactic, key, opponent } = parsed.data;
  const difficulty = opponent ? "normal" : parsed.data.difficulty;

  const [squads, formations, cards, stadium] = await Promise.all([getSquads(userId), getFormations(), getSquadCards(userId), getStadium(userId)]);
  const squad = squads.find((s) => s.id === teamId);
  if (!squad) return { ok: false, message: toUserMessage({ message: "TEAM_NOT_FOUND" }) };

  const built = buildTeamSheet(squad, formations[squad.formation] ?? [], cards, tactic);
  if (!built.ok) return { ok: false, message: `Fill all 11 starting places first (${built.missing} empty).` };

  const seed = randomSeed();
  let away, opponentRating, awayChemistry: number | null = null;
  let friend: { userId: string; teamId: string } | null = null;
  if (opponent) {
    // Friend match: the other manager's saved active squad (read via the scouting function).
    let opp;
    try {
      opp = await getFriendlyOpponent(opponent);
    } catch (e) {
      return { ok: false, message: toUserMessage(e as Error) };
    }
    if (!opp?.squad) return { ok: false, message: toUserMessage({ message: "OPPONENT_NOT_FOUND" }) };
    const oppBuilt = buildTeamSheet(opp.squad, formations[opp.squad.formation] ?? [], opp.cards, opp.squad.tactic);
    if (!oppBuilt.ok) return { ok: false, message: toUserMessage({ message: "OPPONENT_NOT_READY" }) };
    away = oppBuilt.sheet;
    opponentRating = oppBuilt.overall;
    awayChemistry = oppBuilt.chemistry;
    friend = { userId: opp.userId, teamId: opp.squad.id };
  } else {
    opponentRating = built.overall + DIFFICULTY_OFFSET[difficulty];
    away = generateOpponent(seed, opponentRating);
  }
  const homeBonusPct = homeBonus(stadium.levels, stadium.costs);
  const input: MatchInput = { seed, home: built.sheet, away, homeBonusPct, keyMoments: true };

  const admin = createAdminClient();
  const { data: matchId, error } = await admin.rpc("start_match", {
    p_user_id: userId,
    p_team_id: squad.id,
    p_idempotency_key: key,
    p_payload: {
      seed,
      engine_version: ENGINE_VERSION,
      tactic,
      difficulty,
      opponent_name: away.name,
      opponent_rating: Math.round(opponentRating),
      opponent_user_id: friend?.userId ?? null,
      opponent_team_id: friend?.teamId ?? null,
      // Everything needed to replay and verify the match later.
      team_snapshot: input,
      stats: {
        homeOverall: built.overall,
        homeChemistry: built.chemistry,
        homeBonusPct,
        awayFormation: away.formation,
        awayChemistry,
        homeFormation: squad.formation,
      },
    },
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  redirect(`/matches/${matchId}`);
}

export type MomentResult = { ok: true; done: boolean; segment: LiveSegment | null } | { ok: false; message: string };

const decisionSchema = z.object({
  matchId: z.uuid(),
  index: z.number().int().min(0).max(9),
  choice: z.string().regex(/^[a-z_]{2,20}$/),
});

/**
 * The manager's decision at a key moment. It is stored BEFORE the outcome is
 * computed, so a moment can't be retried; then the match advances to the next
 * moment or, at full time, is settled (rewards are paid by the database).
 */
export async function decideMoment(matchId: string, index: number, choice: string): Promise<MomentResult> {
  const parsed = decisionSchema.safeParse({ matchId, index, choice });
  if (!parsed.success) return { ok: false, message: "That choice isn't available." };
  const userId = await getUserId();
  if (!userId) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };

  const match = await loadLiveMatch(userId, parsed.data.matchId);
  if (!match) return { ok: false, message: "This match could not be found." };
  if (match.done) return { ok: true, done: true, segment: null };

  const step = playMatch(match.input, match.decisions);
  const already = parsed.data.index < match.decisions.length && match.decisions[parsed.data.index] === parsed.data.choice;
  if (!already) {
    if (step.done || step.moment.index !== parsed.data.index || !step.moment.options.some((o) => o.id === parsed.data.choice)) {
      return { ok: false, message: "That choice isn't available any more. Reloading the match…" };
    }
    const { error } = await createAdminClient().rpc("record_match_decision", {
      p_user_id: userId,
      p_match: parsed.data.matchId,
      p_index: parsed.data.index,
      p_choice: parsed.data.choice,
    });
    if (error) return { ok: false, message: toUserMessage(error) };
    match.decisions.push(parsed.data.choice);
  }
  return advance(userId, parsed.data.matchId, match.input, match.decisions, match.stats);
}

/** Continues a match that has every decision (e.g. after a dropped connection): settles it. */
export async function resumeMatch(matchId: string): Promise<MomentResult> {
  if (!z.uuid().safeParse(matchId).success) return { ok: false, message: "This match could not be found." };
  const userId = await getUserId();
  if (!userId) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const match = await loadLiveMatch(userId, matchId);
  if (!match) return { ok: false, message: "This match could not be found." };
  if (match.done) return { ok: true, done: true, segment: null };
  return advance(userId, matchId, match.input, match.decisions, match.stats);
}

async function loadLiveMatch(userId: string, matchId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("matches")
    .select("status, team_snapshot, decisions, stats")
    .eq("id", matchId)
    .eq("user_id", userId) // only the manager who kicked off can decide
    .maybeSingle();
  if (!data) return null;
  return {
    done: data.status === "completed",
    input: data.team_snapshot as unknown as MatchInput,
    decisions: [...((data.decisions as string[] | null) ?? [])],
    stats: (data.stats ?? {}) as Record<string, unknown>,
  };
}

async function advance(userId: string, matchId: string, input: MatchInput, decisions: string[], baseStats: Record<string, unknown>): Promise<MomentResult> {
  const step = playMatch(input, decisions);
  if (!step.done) return { ok: true, done: false, segment: liveSegment(step) };

  const { error } = await createAdminClient().rpc("finish_match", {
    p_user_id: userId,
    p_match: matchId,
    p_payload: resultPayload(step.result, baseStats),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  // Keep the top bar's coins/XP current (the final screen masks them until revealed).
  refresh();
  return { ok: true, done: true, segment: null };
}

function resultPayload(result: MatchResult, baseStats: Record<string, unknown>) {
  return {
    home_score: result.score.home,
    away_score: result.score.away,
    stats: {
      ...baseStats,
      home: result.stats.home,
      away: result.stats.away,
      ratings: result.ratings,
      manOfTheMatch: result.manOfTheMatch,
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
}
