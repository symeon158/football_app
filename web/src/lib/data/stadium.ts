import "server-only";

import type { StadiumDesign, StadiumLevels, UpgradeCost } from "@/lib/game/stadium";
import { createClient } from "@/lib/supabase/server";

/** The viewer's stadium, the full price list and recent upgrades (RLS: own only). */
export async function getStadium(userId: string) {
  const supabase = await createClient();
  const [stadium, costs, history] = await Promise.all([
    supabase
      .from("stadiums")
      .select("id, name, area, design_template, capacity, stadium_level, seating_level, lighting_level, pitch_level, facilities_level, created_at")
      .eq("user_id", userId)
      .single(),
    supabase.from("stadium_upgrade_costs").select("category, level, cost, bonus_pct, description").order("category").order("level"),
    supabase
      .from("stadium_upgrades")
      .select("id, category, from_level, to_level, cost, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(10),
  ]);
  if (stadium.error) throw new Error(`Failed to load stadium: ${stadium.error.message}`);
  if (costs.error) throw new Error(`Failed to load upgrade prices: ${costs.error.message}`);
  if (history.error) throw new Error(`Failed to load upgrade history: ${history.error.message}`);

  const s = stadium.data;
  const levels: StadiumLevels = { seating: s.seating_level, lighting: s.lighting_level, pitch: s.pitch_level, facilities: s.facilities_level };
  return {
    id: s.id,
    name: s.name,
    area: s.area,
    design: s.design_template as StadiumDesign,
    capacity: s.capacity ?? 0,
    level: s.stadium_level ?? 1,
    levels,
    costs: (costs.data ?? []).map((c) => ({ ...c, bonus_pct: Number(c.bonus_pct) })) as UpgradeCost[],
    history: history.data ?? [],
  };
}

export type StadiumView = Awaited<ReturnType<typeof getStadium>>;
