import { describe, expect, it } from "vitest";

import {
  autoPick,
  chemistry,
  firstFreeBenchSlot,
  lineRatings,
  placeCard,
  positionFit,
  removeFromSlot,
  startersOf,
  summarize,
  validateLineup,
  type FormationSlot,
  type SquadCard,
} from "./lineup";

const F433: FormationSlot[] = (
  [["GK", 50, 6], ["LB", 15, 28], ["CB", 37, 24], ["CB", 63, 24], ["RB", 85, 28], ["CM", 30, 50], ["CM", 50, 46], ["CM", 70, 50], ["LW", 18, 76], ["ST", 50, 84], ["RW", 82, 76]] as const
).map(([position, x, y], slot) => ({ slot, position, x, y }));

let n = 0;
const card = (position: SquadCard["position"], overall: number, extra: Partial<SquadCard> = {}): SquadCard => {
  n++;
  return { ownershipId: `o${n}`, playerId: `p${n}`, name: `Player ${n}`, position, overall, club: `Club ${n}`, nationality: `N${n}`, ...extra };
};
const mapOf = (cards: SquadCard[]) => new Map(cards.map((c) => [c.ownershipId, c]));

/** A natural 4-3-3 XI where nobody shares a club or nation. */
function naturalXI(overall = 70) {
  const cards = F433.map((s) => card(s.position, overall));
  const lineup = Object.fromEntries(F433.map((s, i) => [s.slot, cards[i].ownershipId]));
  return { cards, lineup };
}

describe("positionFit", () => {
  it("scores natural, related and unrelated positions", () => {
    expect(positionFit("ST", "ST")).toBe(4);
    expect(positionFit("ST", "CAM")).toBe(2);
    expect(positionFit("ST", "CB")).toBe(0);
    expect(positionFit("GK", "CB")).toBe(0);
  });
});

describe("chemistry", () => {
  it("gives fit points only when nobody is linked", () => {
    const { cards, lineup } = naturalXI();
    const c = chemistry(startersOf(lineup, F433, mapOf(cards)));
    expect(c.team).toBe(40); // 11 × 4 / 110
    expect(c.perPlayer.get(cards[0].ownershipId)).toMatchObject({ points: 4, fit: 4, clubLinks: 0, nationLinks: 0, dots: 1 });
  });

  it("rewards club and nation links, capped at 10 per player", () => {
    const cards = F433.map((s) => card(s.position, 70, { club: "Same FC", nationality: "GR" }));
    const lineup = Object.fromEntries(F433.map((s, i) => [s.slot, cards[i].ownershipId]));
    const c = chemistry(startersOf(lineup, F433, mapOf(cards)));
    expect(c.team).toBe(100);
    expect(c.perPlayer.get(cards[3].ownershipId)).toMatchObject({ points: 10, clubLinks: 10, nationLinks: 10, dots: 3 });
  });

  it("scores a single link pair correctly", () => {
    const { cards, lineup } = naturalXI();
    cards[9].club = cards[10].club; // ST and RW share a club
    cards[9].nationality = cards[10].nationality;
    const c = chemistry(startersOf(lineup, F433, mapOf(cards)));
    expect(c.perPlayer.get(cards[9].ownershipId)).toMatchObject({ points: 4 + 2 + 1, clubLinks: 1, nationLinks: 1 });
  });

  it("counts empty slots as zero", () => {
    const { cards, lineup } = naturalXI();
    delete lineup[10];
    expect(chemistry(startersOf(lineup, F433, mapOf(cards))).team).toBe(36); // 10 × 4 / 110
  });
});

describe("summarize", () => {
  it("reports overall, line ratings and problems", () => {
    const { cards, lineup } = naturalXI(80);
    const s = summarize(lineup, F433, mapOf(cards));
    expect(s.overall).toBe(80);
    expect(s.lines).toEqual({ GK: 80, DEF: 80, MID: 80, ATT: 80 });
    expect(s.emptyStarterSlots).toBe(0);
    expect(s.outOfPosition).toBe(0);
  });

  it("penalises out-of-position players in line ratings", () => {
    const { cards, lineup } = naturalXI(80);
    const cb = card("CB", 80);
    cards.push(cb);
    lineup[9] = cb.ownershipId; // CB playing ST
    const s = summarize(lineup, F433, mapOf(cards));
    expect(s.outOfPosition).toBe(1);
    expect(s.lines.ATT).toBe(Math.round((80 + 60 + 80) / 3));
    expect(lineRatings([], F433)).toEqual({ GK: 0, DEF: 0, MID: 0, ATT: 0 });
  });
});

describe("validateLineup", () => {
  it("accepts a clean line-up", () => {
    const { cards, lineup } = naturalXI();
    expect(validateLineup(lineup, cards[0].ownershipId, mapOf(cards))).toEqual([]);
  });

  it("flags duplicate players, bench captains, unknown cards and bad slots", () => {
    const { cards, lineup } = naturalXI();
    const copy = { ...cards[9], ownershipId: "copy-of-striker" };
    cards.push(copy);
    lineup[11] = copy.ownershipId;
    lineup[30] = cards[0].ownershipId;
    lineup[12] = "ghost";
    const codes = validateLineup(lineup, copy.ownershipId, mapOf(cards)).map((p) => p.code).sort();
    expect(codes).toEqual(["BAD_SLOT", "CAPTAIN_NOT_STARTER", "DUPLICATE_PLAYER", "DUPLICATE_PLAYER", "UNKNOWN_CARD"].sort());
  });
});

describe("placeCard", () => {
  it("moves a pool card into an empty slot", () => {
    const a = card("ST", 70);
    expect(placeCard({}, 9, a.ownershipId, mapOf([a]))).toEqual({ 9: a.ownershipId });
  });

  it("swaps two cards already in the squad", () => {
    const a = card("ST", 70), b = card("CB", 70);
    expect(placeCard({ 9: a.ownershipId, 2: b.ownershipId }, 2, a.ownershipId, mapOf([a, b]))).toEqual({ 2: a.ownershipId, 9: b.ownershipId });
  });

  it("sends the displaced card back to the pool when placing from the pool", () => {
    const a = card("ST", 70), b = card("ST", 75);
    expect(placeCard({ 9: a.ownershipId }, 9, b.ownershipId, mapOf([a, b]))).toEqual({ 9: b.ownershipId });
  });

  it("keeps only one copy of a player", () => {
    const a = card("ST", 70);
    const copy = { ...a, ownershipId: "copy" };
    expect(placeCard({ 11: a.ownershipId }, 9, copy.ownershipId, mapOf([a, copy]))).toEqual({ 9: "copy" });
  });

  it("removes and finds bench slots", () => {
    expect(removeFromSlot({ 1: "a", 2: "b" }, 1)).toEqual({ 2: "b" });
    expect(firstFreeBenchSlot({ 11: "a", 12: "b" })).toBe(13);
    expect(firstFreeBenchSlot(Object.fromEntries(Array.from({ length: 23 }, (_, i) => [i, `x${i}`])))).toBeNull();
  });
});

describe("autoPick", () => {
  it("fills every slot with the best natural player and a 7-player bench", () => {
    const pool = [...F433.map((s) => card(s.position, 60)), ...F433.map((s) => card(s.position, 75)), card("CAM", 90)];
    const lineup = autoPick(F433, pool);
    const byId = mapOf(pool);
    for (const s of F433) expect(byId.get(lineup[s.slot])?.position === s.position || byId.get(lineup[s.slot])?.overall === 90).toBe(true);
    expect(Object.keys(lineup).filter((s) => Number(s) >= 11)).toHaveLength(7);
    expect(validateLineup(lineup, null, byId)).toEqual([]);
  });

  it("never picks two copies of the same player and is deterministic", () => {
    const st = card("ST", 85);
    const pool = [st, { ...st, ownershipId: "st-copy" }, ...F433.map((s) => card(s.position, 60))];
    const a = autoPick(F433, pool);
    expect(Object.values(a).filter((id) => id === st.ownershipId || id === "st-copy")).toHaveLength(1);
    expect(autoPick(F433, [...pool].reverse())).toEqual(a);
  });
});
