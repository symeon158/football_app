"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { toUserMessage } from "@/lib/errors";
import { createClient, getUserId } from "@/lib/supabase/server";

export type ClaimResult = { ok: boolean; message?: string; coins?: number; xp?: number; level?: number };

/**
 * Completion, "once per period" and the payout are all enforced by
 * claim_challenge / claim_achievement in the database (ledger key per
 * challenge + period), so a double click or replay can never pay twice.
 */
async function claim(fn: "claim_challenge" | "claim_achievement", id: string): Promise<ClaimResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid request." };
  if (!(await getUserId())) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const supabase = await createClient();
  const { data, error } =
    fn === "claim_challenge"
      ? await supabase.rpc("claim_challenge", { p_challenge_id: id })
      : await supabase.rpc("claim_achievement", { p_achievement_id: id });
  if (error) return { ok: false, message: toUserMessage(error) };
  refresh(); // coins, XP and level in the top bar
  const r = data as { coins: number; xp: number; level: number };
  return { ok: true, coins: r.coins, xp: r.xp, level: r.level, message: "Reward claimed!" };
}

export async function claimChallenge(id: string) {
  return claim("claim_challenge", id);
}

export async function claimAchievement(id: string) {
  return claim("claim_achievement", id);
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name.").max(40, "Use at most 40 characters."),
  avatarKey: z.string().regex(/^avatar-(0[1-9]|1[0-2])$/, "Pick an avatar."),
});

/** Display name and avatar are cosmetic: direct update under RLS + column grants. */
export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ClaimResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0] ?? "Invalid input." };
  const userId = await getUserId();
  if (!userId) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, avatar_key: parsed.data.avatarKey })
    .eq("id", userId);
  if (error) return { ok: false, message: toUserMessage(error) };
  refresh();
  return { ok: true, message: "Profile updated." };
}
