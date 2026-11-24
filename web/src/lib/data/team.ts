import "server-only";

import type { FormationSlot, Lineup, SquadCard } from "@/lib/game/lineup";
import { summarize } from "@/lib/game/lineup";
import type { PlayerCardData } from "@/components/game/player-card";
import { toCardData } from "@/lib/game/player";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Formation = Database["public"]["Enums"]["formation_code"];

export type BuilderCard = SquadCard & { rarity: PlayerCardData["rarity"]; card: PlayerCardData };

/** Formation → its 11 slots with pitch coordinates. */
export async function getFormations(): Promise<Record<Formation, FormationSlot[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("formation_slots").select("formation, slot, position, x, y").order("slot");
  if (error) throw new Error(`Failed to load formations: ${error.message}`);
  const out = {} as Record<Formation, FormationSlot[]>;
  for (const row of data ?? []) (out[row.formation] ??= []).push({ slot: row.slot, position: row.position, x: row.x, y: row.y });
  return out;
}

/** All of the user's squads with their line-ups. */
export async function getSquads(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, logo_template, primary_color, secondary_color, formation, tactic, captain_ownership_id, is_active, updated_at, team_players(slot, ownership_id)")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at");
  if (error) throw new Error(`Failed to load squads: ${error.message}`);
  return (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    logoTemplate: t.logo_template,
    primaryColor: t.primary_color,
    secondaryColor: t.secondary_color,
    formation: t.formation,
    tactic: t.tactic,
    captain: t.captain_ownership_id,
    isActive: t.is_active,
    lineup: Object.fromEntries(t.team_players.map((tp) => [tp.slot, tp.ownership_id])) as Lineup,
  }));
}

export type Squad = Awaited<ReturnType<typeof getSquads>>[number];

/** Every owned card in the shape the builder needs (RLS-scoped view). */
export async function getSquadCards(userId: string): Promise<BuilderCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("my_collection")
    .select("ownership_id, player_id, display_name, first_name, last_name, known_as, position, overall, club, nationality, rarity, pace, shooting, passing, dribbling, defending, physicality")
    .eq("user_id", userId)
    .order("overall", { ascending: false })
    .order("ownership_id");
  if (error) throw new Error(`Failed to load your cards: ${error.message}`);
  return (data ?? []).map((r) => ({
    ownershipId: r.ownership_id,
    playerId: r.player_id,
    name: r.display_name ?? `${r.first_name} ${r.last_name}`,
    position: r.position,
    overall: r.overall,
    club: r.club,
    nationality: r.nationality,
    rarity: r.rarity,
    card: toCardData(r),
  }));
}

/** Rating + chemistry for each squad (for the My Club overview). */
export function squadSummaries(squads: Squad[], formations: Record<Formation, FormationSlot[]>, cards: BuilderCard[]) {
  const byId = new Map(cards.map((c) => [c.ownershipId, c]));
  return new Map(
    squads.map((s) => {
      const sum = summarize(s.lineup, formations[s.formation] ?? [], byId);
      return [s.id, { overall: sum.overall, chemistry: sum.chemistry.team, players: Object.keys(s.lineup).length }];
    }),
  );
}
