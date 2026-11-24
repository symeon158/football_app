import { z } from "zod";

import { MAX_SLOTS } from "@/lib/game/lineup";

export const FORMATIONS = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"] as const;
export const TACTICS = ["balanced", "attacking", "defensive"] as const;
export const CREST_TEMPLATES = ["crest-01", "crest-02", "crest-03", "crest-04", "crest-05", "crest-06"] as const;

export const TACTIC_INFO: Record<(typeof TACTICS)[number], { label: string; description: string }> = {
  balanced: { label: "Balanced", description: "Even focus on attack and defence." },
  attacking: { label: "Attacking", description: "More chances created, more conceded." },
  defensive: { label: "Defensive", description: "Fewer chances conceded, fewer created." },
};

/** Must match the CHECK constraint on teams.name (3–30 chars after trimming). */
export const teamNameSchema = z.string().trim().min(3, "Use at least 3 characters.").max(30, "Use at most 30 characters.");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a valid colour.");

export const lineupSchema = z
  .object({
    teamId: z.uuid(),
    formation: z.enum(FORMATIONS),
    tactic: z.enum(TACTICS),
    captain: z.uuid().nullable(),
    slots: z
      .array(z.object({ slot: z.number().int().min(0).max(MAX_SLOTS - 1), ownershipId: z.uuid() }))
      .max(MAX_SLOTS),
  })
  .refine((v) => new Set(v.slots.map((s) => s.slot)).size === v.slots.length, "Duplicate slot.")
  .refine((v) => new Set(v.slots.map((s) => s.ownershipId)).size === v.slots.length, "Duplicate card.");

export type LineupInput = z.infer<typeof lineupSchema>;

export const teamIdentitySchema = z.object({
  teamId: z.uuid(),
  name: teamNameSchema,
  logoTemplate: z.enum(CREST_TEMPLATES),
  primaryColor: hexColor,
  secondaryColor: hexColor,
});

export const createTeamSchema = z.object({
  name: teamNameSchema,
  copyFrom: z.uuid().nullable(),
});

export type ActionResult = { ok: boolean; message?: string };
