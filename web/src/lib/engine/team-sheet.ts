import type { BuilderCard, Squad } from "@/lib/data/team";
import { STARTER_SLOTS, summarize, type FormationSlot } from "@/lib/game/lineup";

import type { EnginePlayer, Formation, Tactic, TeamSheet } from "./types";

export function toEnginePlayer(c: BuilderCard): EnginePlayer {
  return {
    id: c.ownershipId,
    name: c.name,
    position: c.position,
    overall: c.overall,
    pace: c.card.pace,
    shooting: c.card.shooting,
    passing: c.card.passing,
    dribbling: c.card.dribbling,
    defending: c.card.defending,
    physicality: c.card.physicality,
  };
}

export type SheetResult =
  | { ok: true; sheet: TeamSheet; overall: number; chemistry: number }
  | { ok: false; reason: "INCOMPLETE_XI"; missing: number };

/** Builds the engine's view of a saved squad. Requires a full starting XI. */
export function buildTeamSheet(squad: Squad, slots: FormationSlot[], cards: BuilderCard[], tactic: Tactic): SheetResult {
  const byId = new Map(cards.map((c) => [c.ownershipId, c]));
  const summary = summarize(squad.lineup, slots, byId);
  if (summary.starters.length < STARTER_SLOTS) {
    return { ok: false, reason: "INCOMPLETE_XI", missing: STARTER_SLOTS - summary.starters.length };
  }
  const starters = [...summary.starters]
    .sort((a, b) => a.slot - b.slot)
    .map((s) => ({ slotPosition: s.slotPosition, player: toEnginePlayer(s.card as BuilderCard) }));
  const bench = Object.entries(squad.lineup)
    .filter(([slot]) => Number(slot) >= STARTER_SLOTS)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, id]) => byId.get(id))
    .filter((c): c is BuilderCard => Boolean(c))
    .map(toEnginePlayer);
  return {
    ok: true,
    overall: summary.overall,
    chemistry: summary.chemistry.team,
    sheet: {
      name: squad.name,
      formation: squad.formation as Formation,
      tactic,
      chemistry: summary.chemistry.team,
      captainId: squad.captain,
      starters,
      bench,
    },
  };
}
