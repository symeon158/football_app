"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toUserMessage } from "@/lib/errors";
import { createClient, getUserId } from "@/lib/supabase/server";
import {
  createTeamSchema,
  lineupSchema,
  teamIdentitySchema,
  type ActionResult,
  type LineupInput,
} from "@/lib/validation/team";

/**
 * Squad mutations. Each one validates input with zod, then calls an RLS-scoped
 * Supabase client: the database (RPCs + RLS) is the authority that checks
 * ownership and game rules; these actions only shape input and map errors.
 */

const invalid = (error: z.ZodError): ActionResult => ({
  ok: false,
  message: z.flattenError(error).formErrors[0] ?? Object.values(z.flattenError(error).fieldErrors).flat()[0] ?? "Invalid input.",
});

async function authed() {
  const userId = await getUserId();
  if (!userId) return null;
  return createClient();
}

export async function saveLineup(input: LineupInput): Promise<ActionResult> {
  const parsed = lineupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await authed();
  if (!supabase) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };

  const { teamId, formation, tactic, captain, slots } = parsed.data;
  const { error } = await supabase.rpc("save_lineup", {
    p_team_id: teamId,
    p_formation: formation,
    p_tactic: tactic,
    // The function accepts NULL ("no captain"); the generated type is too strict.
    p_captain: captain as string,
    p_slots: slots.map((s) => ({ slot: s.slot, ownership_id: s.ownershipId })),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  refresh();
  return { ok: true, message: "Line-up saved." };
}

export async function setActiveSquad(teamId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(teamId).success) return { ok: false, message: "Invalid squad." };
  const supabase = await authed();
  if (!supabase) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const { error } = await supabase.rpc("set_active_team", { p_team_id: teamId });
  if (error) return { ok: false, message: toUserMessage(error) };
  refresh();
  return { ok: true, message: "Active squad updated." };
}

export async function updateSquadIdentity(input: z.input<typeof teamIdentitySchema>): Promise<ActionResult> {
  const parsed = teamIdentitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await authed();
  if (!supabase) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const { teamId, name, logoTemplate, primaryColor, secondaryColor } = parsed.data;
  const { data, error } = await supabase
    .from("teams")
    .update({ name, logo_template: logoTemplate, primary_color: primaryColor, secondary_color: secondaryColor })
    .eq("id", teamId)
    .select("id");
  if (error) return { ok: false, message: toUserMessage(error) };
  if (!data?.length) return { ok: false, message: toUserMessage({ message: "TEAM_NOT_FOUND" }) };
  refresh();
  return { ok: true, message: "Squad updated." };
}

export async function createSquad(input: z.input<typeof createTeamSchema>): Promise<ActionResult> {
  const parsed = createTeamSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await authed();
  if (!supabase) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const { data, error } = await supabase.rpc("create_team", {
    p_name: parsed.data.name,
    ...(parsed.data.copyFrom ? { p_copy_from: parsed.data.copyFrom } : {}),
  });
  if (error) return { ok: false, message: toUserMessage(error) };
  redirect(`/team?team=${data}`);
}

export async function deleteSquad(teamId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(teamId).success) return { ok: false, message: "Invalid squad." };
  const supabase = await authed();
  if (!supabase) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };
  const { error } = await supabase.rpc("delete_team", { p_team_id: teamId });
  if (error) return { ok: false, message: toUserMessage(error) };
  refresh();
  return { ok: true, message: "Squad deleted." };
}
