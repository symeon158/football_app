import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { Rng } from "@/lib/engine/rng";

import { summarize, type FormationSlot, type SquadCard } from "./lineup";

/**
 * The squad rating and chemistry exist twice: in TypeScript (UI, engine) and
 * in SQL (cached on teams for challenges and leaderboards). This saves random
 * line-ups — many deliberately out of position — through the real
 * save_lineup() RPC and checks both implementations agree exactly.
 *
 * Needs the local Supabase stack: INTEGRATION=1 npx vitest run parity
 */
const run = process.env.INTEGRATION ? describe : describe.skip;

run("TypeScript ↔ SQL team metrics parity", () => {
  it("matches for 25 random line-ups", { timeout: 120_000 }, async () => {
    const env = Object.fromEntries(
      readFileSync(new URL("../../../.env.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const id = Date.now().toString(36);
    const { data: auth, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.signUp({
      email: `parity_${id}@example.test`, password: "Kickoff2026", options: { data: { username: `parity_${id}` } },
    });
    if (error || !auth.session) throw error ?? new Error("no session");
    const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } }, auth: { persistSession: false } });

    const [{ data: slotsRaw }, { data: cardsRaw }, { data: team }] = await Promise.all([
      sb.from("formation_slots").select("formation, slot, position, x, y"),
      sb.from("my_collection").select("ownership_id, player_id, display_name, position, overall, club, nationality").eq("user_id", auth.user!.id),
      sb.from("teams").select("id").eq("is_active", true).single(),
    ]);
    const cards: SquadCard[] = (cardsRaw ?? []).map((c) => ({
      ownershipId: c.ownership_id, playerId: c.player_id, name: c.display_name ?? "", position: c.position,
      overall: c.overall, club: c.club, nationality: c.nationality,
    }));
    const byId = new Map(cards.map((c) => [c.ownershipId, c]));
    const rng = new Rng(20261124);
    const formations = ["4-3-3", "4-4-2", "3-5-2", "4-2-3-1"] as const;

    for (let i = 0; i < 25; i++) {
      const formation = rng.pick(formations);
      const slots = (slotsRaw ?? []).filter((s) => s.formation === formation) as FormationSlot[];
      // Random distinct players into random slots (some XI slots left empty sometimes).
      const pool = [...cards].sort(() => rng.next() - 0.5);
      const used = new Set<string>();
      const lineup: Record<number, string> = {};
      const fill = i % 5 === 0 ? 9 : 11;
      for (const s of slots.slice(0, fill)) {
        const c = pool.find((p) => !used.has(p.playerId))!;
        used.add(c.playerId);
        lineup[s.slot] = c.ownershipId;
      }
      const { error: saveErr } = await sb.rpc("save_lineup", {
        p_team_id: team!.id, p_formation: formation, p_tactic: "balanced", p_captain: null as unknown as string,
        p_slots: Object.entries(lineup).map(([slot, ownership_id]) => ({ slot: Number(slot), ownership_id })),
      });
      expect(saveErr).toBeNull();
      const { data: cached } = await sb.from("teams").select("overall_cached, chemistry_cached").eq("id", team!.id).single();
      const ts = summarize(lineup, slots, byId);
      expect({ i, formation, overall: cached!.overall_cached, chemistry: cached!.chemistry_cached }).toEqual({
        i, formation, overall: ts.overall, chemistry: ts.chemistry.team,
      });
    }
  });
});
