import { effectiveRating, RELATED, teamOverall, type Position } from "./team-rating";

/**
 * Pure line-up rules shared by the Team Builder UI, server actions and later
 * phases (match engine, challenges). The database's save_lineup() enforces
 * the same invariants authoritatively.
 */

export const STARTER_SLOTS = 11; // slots 0–10
export const MAX_SLOTS = 23; // + 12 substitutes (slots 11–22)
export const BENCH_SLOTS = MAX_SLOTS - STARTER_SLOTS;

export type SquadCard = {
  ownershipId: string;
  playerId: string;
  name: string;
  position: Position;
  overall: number;
  club: string;
  nationality: string;
};

export type FormationSlot = { slot: number; position: Position; x: number; y: number };

/** slot number → ownershipId */
export type Lineup = Record<number, string>;

export type Starter = { slot: number; slotPosition: Position; card: SquadCard };

export function startersOf(lineup: Lineup, slots: FormationSlot[], cards: Map<string, SquadCard>): Starter[] {
  return slots
    .filter((s) => s.slot < STARTER_SLOTS && lineup[s.slot] && cards.has(lineup[s.slot]))
    .map((s) => ({ slot: s.slot, slotPosition: s.position, card: cards.get(lineup[s.slot])! }));
}

/* ---------------------------------------------------------------- chemistry */

export const MAX_PLAYER_CHEMISTRY = 10;

export type PlayerChemistry = {
  points: number; // 0–10
  fit: number; // 0, 2 or 4
  clubLinks: number; // team-mates from the same club
  nationLinks: number; // team-mates from the same nation
  dots: 0 | 1 | 2 | 3; // compact display
};


export function positionFit(slotPosition: Position, cardPosition: Position): 0 | 2 | 4 {
  if (slotPosition === cardPosition) return 4;
  if (RELATED[slotPosition].includes(cardPosition)) return 2;
  return 0;
}

const clubPoints = (links: number) => (links >= 2 ? 3 : links === 1 ? 2 : 0);
const nationPoints = (links: number) => Math.min(3, links);

/**
 * Chemistry per starter: position fit (natural 4 · related 2 · other 0)
 * + club links (1 → 2, 2+ → 3) + nation links (1 → 1, 2 → 2, 3+ → 3).
 * Team chemistry = total / (11 × 10) as 0–100; empty slots contribute 0.
 */
export function chemistry(starters: Starter[]) {
  const perPlayer = new Map<string, PlayerChemistry>();
  let total = 0;
  for (const s of starters) {
    const others = starters.filter((o) => o.card.ownershipId !== s.card.ownershipId);
    const clubLinks = others.filter((o) => o.card.club === s.card.club).length;
    const nationLinks = others.filter((o) => o.card.nationality === s.card.nationality).length;
    const fit = positionFit(s.slotPosition, s.card.position);
    const points = fit + clubPoints(clubLinks) + nationPoints(nationLinks);
    const dots = (points >= 8 ? 3 : points >= 5 ? 2 : points >= 2 ? 1 : 0) as PlayerChemistry["dots"];
    perPlayer.set(s.card.ownershipId, { points, fit, clubLinks, nationLinks, dots });
    total += points;
  }
  return { team: Math.round((total / (STARTER_SLOTS * MAX_PLAYER_CHEMISTRY)) * 100), perPlayer };
}

/* ------------------------------------------------------------ line ratings */

export const LINE_OF: Record<Position, "GK" | "DEF" | "MID" | "ATT"> = {
  GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", LM: "MID", RM: "MID",
  LW: "ATT", RW: "ATT", ST: "ATT",
};

/** Average effective rating per line (by the slot's position), 0 if empty. */
export function lineRatings(starters: Starter[], slots: FormationSlot[]) {
  const lines = { GK: [] as number[], DEF: [] as number[], MID: [] as number[], ATT: [] as number[] };
  const size = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const s of slots.filter((x) => x.slot < STARTER_SLOTS)) size[LINE_OF[s.position]]++;
  for (const s of starters) {
    lines[LINE_OF[s.slotPosition]].push(effectiveRating({ slotPosition: s.slotPosition, cardPosition: s.card.position, overall: s.card.overall }));
  }
  const avg = (k: keyof typeof lines) => (size[k] ? Math.round(lines[k].reduce((a, b) => a + b, 0) / size[k]) : 0);
  return { GK: avg("GK"), DEF: avg("DEF"), MID: avg("MID"), ATT: avg("ATT") };
}

export function summarize(lineup: Lineup, slots: FormationSlot[], cards: Map<string, SquadCard>) {
  const starters = startersOf(lineup, slots, cards);
  return {
    starters,
    overall: teamOverall(starters.map((s) => ({ slotPosition: s.slotPosition, cardPosition: s.card.position, overall: s.card.overall }))),
    chemistry: chemistry(starters),
    lines: lineRatings(starters, slots),
    emptyStarterSlots: STARTER_SLOTS - starters.length,
    outOfPosition: starters.filter((s) => positionFit(s.slotPosition, s.card.position) < 4).length,
  };
}

/* --------------------------------------------------------------- validation */

export type LineupProblem =
  | { code: "DUPLICATE_PLAYER"; name: string }
  | { code: "CAPTAIN_NOT_STARTER" }
  | { code: "UNKNOWN_CARD" }
  | { code: "BAD_SLOT"; slot: number };

/** Mirrors save_lineup()'s checks so the UI can explain problems before saving. */
export function validateLineup(lineup: Lineup, captain: string | null, cards: Map<string, SquadCard>): LineupProblem[] {
  const problems: LineupProblem[] = [];
  const seenPlayers = new Map<string, string>();
  for (const [slotKey, ownershipId] of Object.entries(lineup)) {
    const slot = Number(slotKey);
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_SLOTS) problems.push({ code: "BAD_SLOT", slot });
    const card = cards.get(ownershipId);
    if (!card) {
      problems.push({ code: "UNKNOWN_CARD" });
      continue;
    }
    if (seenPlayers.has(card.playerId)) problems.push({ code: "DUPLICATE_PLAYER", name: card.name });
    seenPlayers.set(card.playerId, ownershipId);
  }
  if (captain && !Object.entries(lineup).some(([s, id]) => id === captain && Number(s) < STARTER_SLOTS)) {
    problems.push({ code: "CAPTAIN_NOT_STARTER" });
  }
  return problems;
}

/* ------------------------------------------------------------------ editing */

/**
 * Places `ownershipId` into `slot`. If the card was already in another slot,
 * the two swap; if it was in the pool, any card in the target slot returns
 * to the pool. A different copy of the same player already in the squad is
 * moved out (one copy of each player per squad).
 */
export function placeCard(lineup: Lineup, slot: number, ownershipId: string, cards: Map<string, SquadCard>): Lineup {
  const next: Lineup = { ...lineup };
  const from = Object.entries(next).find(([, id]) => id === ownershipId)?.[0];
  const displaced = next[slot];
  if (from !== undefined) {
    delete next[Number(from)];
    if (displaced && Number(from) !== slot) next[Number(from)] = displaced;
  }
  next[slot] = ownershipId;
  const playerId = cards.get(ownershipId)?.playerId;
  for (const [s, id] of Object.entries(next)) {
    if (Number(s) !== slot && id !== ownershipId && cards.get(id)?.playerId === playerId) delete next[Number(s)];
  }
  return next;
}

export function removeFromSlot(lineup: Lineup, slot: number): Lineup {
  const next = { ...lineup };
  delete next[slot];
  return next;
}

export function firstFreeBenchSlot(lineup: Lineup): number | null {
  for (let s = STARTER_SLOTS; s < MAX_SLOTS; s++) if (!lineup[s]) return s;
  return null;
}

/**
 * Best XI for a formation: greedily assigns the highest effective rating
 * (slot, card) pairs, one copy per player, then fills 7 bench places by
 * overall. Deterministic (ties broken by ownershipId).
 */
export function autoPick(slots: FormationSlot[], cards: SquadCard[], benchSize = 7): Lineup {
  const starterSlots = slots.filter((s) => s.slot < STARTER_SLOTS);
  const pairs = starterSlots.flatMap((s) =>
    cards.map((c) => ({ slot: s.slot, card: c, score: effectiveRating({ slotPosition: s.position, cardPosition: c.position, overall: c.overall }) })),
  );
  pairs.sort((a, b) => b.score - a.score || a.card.ownershipId.localeCompare(b.card.ownershipId) || a.slot - b.slot);

  const lineup: Lineup = {};
  const usedPlayers = new Set<string>();
  for (const p of pairs) {
    if (lineup[p.slot] || usedPlayers.has(p.card.playerId)) continue;
    lineup[p.slot] = p.card.ownershipId;
    usedPlayers.add(p.card.playerId);
  }
  const bench = cards
    .filter((c) => !usedPlayers.has(c.playerId))
    .sort((a, b) => b.overall - a.overall || a.ownershipId.localeCompare(b.ownershipId));
  let slot = STARTER_SLOTS;
  for (const c of bench) {
    if (slot >= STARTER_SLOTS + benchSize) break;
    if (usedPlayers.has(c.playerId)) continue;
    lineup[slot++] = c.ownershipId;
    usedPlayers.add(c.playerId);
  }
  return lineup;
}

/** Best-rated starter, used as the default captain. */
export function bestStarter(starters: Starter[]): string | null {
  return [...starters].sort((a, b) => b.card.overall - a.card.overall)[0]?.card.ownershipId ?? null;
}
