"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUserId } from "@/lib/supabase/server";
import { passwordSchema } from "@/lib/validation/auth";

export type SettingsResult = { ok: boolean; message?: string; data?: string };

/** The signed-in user's id + e-mail from the verified JWT. */
async function currentIdentity() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  const email = data?.claims?.email as string | undefined;
  return id && email ? { id, email, supabase } : null;
}

/**
 * Re-checks the current password on a throwaway client (no cookies, no
 * session persistence) so verifying it can never alter the real session.
 */
async function passwordMatches(email: string, password: string) {
  const env = publicEnv();
  const probe = createPlainClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (!error) await probe.auth.signOut({ scope: "local" });
  return !error;
}

const changePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password.").max(72), next: passwordSchema });

export async function changePassword(input: z.input<typeof changePasswordSchema>): Promise<SettingsResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0] ?? "Invalid input." };
  const me = await currentIdentity();
  if (!me) return { ok: false, message: "Please sign in again." };
  if (parsed.data.current === parsed.data.next) return { ok: false, message: "Choose a password different from the current one." };
  if (!(await passwordMatches(me.email, parsed.data.current))) return { ok: false, message: "Your current password is incorrect." };
  const { error } = await me.supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { ok: false, message: error.code === "weak_password" ? error.message : "Could not change the password. Please try again." };
  return { ok: true, message: "Password changed." };
}

/**
 * Everything the game stores about the user, as JSON (data portability).
 * Read through the user's own RLS-scoped client, so it can only ever contain
 * their own rows.
 */
export async function exportMyData(): Promise<SettingsResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, message: "Please sign in again." };
  const supabase = await createClient();
  const [profile, wallet, transactions, cards, teams, stadium, upgrades, matches, packs, challenges, achievements] = await Promise.all([
    supabase.from("profiles").select("username, display_name, avatar_key, level, xp, created_at").eq("id", userId).single(),
    supabase.from("wallets").select("balance, updated_at").eq("user_id", userId).single(),
    supabase.from("coin_transactions").select("amount, balance_after, tx_type, reference_type, reference_id, created_at").eq("user_id", userId).order("id"),
    supabase.from("my_collection").select("ownership_id, card_id, display_name, rarity, position, overall, acquired_via, acquired_at").eq("user_id", userId).order("acquired_at"),
    supabase.from("teams").select("name, formation, tactic, is_active, logo_template, primary_color, secondary_color, created_at, team_players(slot, ownership_id)").eq("user_id", userId),
    supabase.from("stadiums").select("name, design_template, capacity, stadium_level, seating_level, lighting_level, pitch_level, facilities_level").eq("user_id", userId).single(),
    supabase.from("stadium_upgrades").select("category, from_level, to_level, cost, created_at").eq("user_id", userId).order("created_at"),
    supabase.from("matches").select("opponent_name, opponent_rating, difficulty, tactic, home_score, away_score, reward_coins, xp_gained, seed, engine_version, completed_at").eq("user_id", userId).order("created_at"),
    supabase.from("pack_openings").select("price_paid, created_at, card_packs(name)").eq("user_id", userId).order("created_at"),
    supabase.from("user_challenges").select("challenge_id, period_start, progress, completed_at, claimed_at").eq("user_id", userId),
    supabase.from("user_achievements").select("achievement_id, unlocked_at, claimed_at").eq("user_id", userId),
  ]);
  const failed = [profile, wallet, transactions, cards, teams, stadium, upgrades, matches, packs, challenges, achievements].find((r) => r.error);
  if (failed?.error) return { ok: false, message: "Could not export your data. Please try again." };

  const exportDoc = {
    exported_at: new Date().toISOString(),
    note: "Football Legends — all game data stored for your account. Coins are virtual and have no monetary value.",
    profile: profile.data,
    wallet: wallet.data,
    coin_transactions: transactions.data,
    cards: cards.data,
    squads: teams.data,
    stadium: stadium.data,
    stadium_upgrades: upgrades.data,
    matches: matches.data,
    pack_openings: packs.data,
    challenges_claimed: challenges.data,
    achievements: achievements.data,
  };
  return { ok: true, data: JSON.stringify(exportDoc, null, 2) };
}

const deleteSchema = z.object({ confirmUsername: z.string().trim().min(1), password: z.string().min(1).max(72) });

/**
 * Permanently deletes the account. Requires typing the username and the
 * current password. The auth user is removed with the service role; database
 * cascades remove all game data (tests/database/11).
 */
export async function deleteMyAccount(input: z.input<typeof deleteSchema>): Promise<SettingsResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Type your username and password to confirm." };
  const me = await currentIdentity();
  if (!me) return { ok: false, message: "Please sign in again." };
  const { data: profile } = await me.supabase.from("profiles").select("username").eq("id", me.id).single();
  if (!profile || profile.username.toLowerCase() !== parsed.data.confirmUsername.toLowerCase()) {
    return { ok: false, message: "The username you typed doesn't match your account." };
  }
  if (!(await passwordMatches(me.email, parsed.data.password))) return { ok: false, message: "Your password is incorrect." };

  const { error } = await createAdminClient().auth.admin.deleteUser(me.id);
  if (error) return { ok: false, message: "Could not delete the account. Please try again." };
  await me.supabase.auth.signOut();
  redirect("/?deleted=1");
}
