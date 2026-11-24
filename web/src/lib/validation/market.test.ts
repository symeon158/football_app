import { describe, expect, it } from "vitest";

import { formatOdds, idempotencyKeySchema, marketFiltersToQuery, newIdempotencyKey, parseMarketFilters } from "./market";

describe("parseMarketFilters", () => {
  it("defaults and accepts valid filters", () => {
    expect(parseMarketFilters({})).toMatchObject({ sort: "overall-desc", page: 1 });
    expect(parseMarketFilters({}).min).toBeUndefined();
    expect(parseMarketFilters({ min: "80", sort: "price-asc", rarity: "epic", position: "ST", nation: "GR", q: " ana " }))
      .toEqual({ min: 80, sort: "price-asc", rarity: "epic", position: "ST", nation: "GR", q: "ana", page: 1 });
  });

  it("ignores tampered values", () => {
    expect(parseMarketFilters({ min: "81", sort: "drop table", rarity: "mythic", page: "0" }))
      .toMatchObject({ min: undefined, sort: "overall-desc", rarity: undefined, page: 1 });
    expect(parseMarketFilters({ min: "abc" }).min).toBeUndefined();
  });

  it("round-trips through the query string", () => {
    const qs = marketFiltersToQuery({ min: 85, sort: "price-desc", page: 3 });
    expect(qs).toBe("?min=85&sort=price-desc&page=3");
    expect(parseMarketFilters(Object.fromEntries(new URLSearchParams(qs)))).toMatchObject({ min: 85, sort: "price-desc", page: 3 });
    expect(marketFiltersToQuery({ sort: "overall-desc", page: 1 })).toBe("");
  });
});

describe("idempotency keys", () => {
  it("generates keys the database accepts", () => {
    for (let i = 0; i < 20; i++) expect(idempotencyKeySchema.safeParse(newIdempotencyKey()).success).toBe(true);
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("has spaces in it").success).toBe(false);
  });
});

describe("formatOdds", () => {
  it.each([
    [8000, "80%"], [1800, "18%"], [450, "4.5%"], [50, "0.5%"], [1, "0.01%"], [0, "0%"], [125, "1.25%"],
  ])("%i bp → %s", (bp, out) => {
    expect(formatOdds(bp)).toBe(out);
  });
});
