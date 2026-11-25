"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { toUserMessage } from "@/lib/errors";
import { AREA_PATTERN, CATEGORIES, DESIGNS } from "@/lib/game/stadium";
import { createClient, getUserId } from "@/lib/supabase/server";
import { idempotencyKeySchema } from "@/lib/validation/market";

export type StadiumActionResult = { ok: boolean; message?: string; level?: number };

const upgradeSchema = z.object({
  category: z.enum(CATEGORIES as [string, ...string[]]),
  expectedLevel: z.number().int().min(1).max(5),
  key: idempotencyKeySchema,
});

/** Price, balance and the level check are enforced by upgrade_stadium() in the database. */
export async function upgradeStadium(input: z.input<typeof upgradeSchema>): Promise<StadiumActionResult> {
  const parsed = upgradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  if (!(await getUserId())) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upgrade_stadium", {
    p_category: parsed.data.category as (typeof CATEGORIES)[number],
    p_expected_level: parsed.data.expectedLevel,
    p_idempotency_key: parsed.data.key,
  });
  if (error) {
    // A stale view should show the real level straight away.
    if (error.message === "STADIUM_LEVEL_CHANGED") refresh();
    return { ok: false, message: toUserMessage(error) };
  }
  refresh(); // new level, capacity and coin balance everywhere
  return { ok: true, level: data, message: `Upgraded to level ${data}!` };
}

const identitySchema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters.").max(40, "Use at most 40 characters."),
  design: z.enum(DESIGNS),
  area: z
    .string()
    .trim()
    .max(30, "Use at most 30 characters.")
    .refine((v) => v === "" || (v.length >= 2 && AREA_PATTERN.test(v)), "Use letters only (2–30), e.g. Kypseli.")
    .optional(),
});

/** Name and design are cosmetic: updated directly under RLS + column grants. */
export async function updateStadium(input: z.input<typeof identitySchema>): Promise<StadiumActionResult> {
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) {
    const f = z.flattenError(parsed.error).fieldErrors;
    return { ok: false, message: f.name?.[0] ?? f.area?.[0] ?? "Invalid input." };
  }
  const userId = await getUserId();
  if (!userId) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stadiums")
    .update({ name: parsed.data.name, design_template: parsed.data.design, ...(parsed.data.area !== undefined ? { area: parsed.data.area || null } : {}) })
    .eq("user_id", userId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: toUserMessage({ message: "STADIUM_NOT_FOUND" }) };
  refresh();
  return { ok: true, message: "Ground updated." };
}
