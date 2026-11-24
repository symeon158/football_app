import { describe, expect, it } from "vitest";

import { ageOn, countryName, parseCareer, statLabels } from "@/lib/game/player";

import { escapeLike, filtersToQuery, parseCollectionFilters, parseCompareIds, toSearchKey } from "./collection";

describe("parseCollectionFilters", () => {
  it("applies defaults", () => {
    expect(parseCollectionFilters({})).toEqual({ q: undefined, position: undefined, rarity: undefined, nation: undefined, sort: "overall-desc", page: 1 });
  });

  it("accepts valid filters", () => {
    expect(parseCollectionFilters({ q: " silva ", position: "ST", rarity: "epic", nation: "GR", sort: "name", page: "3" }))
      .toEqual({ q: "silva", position: "ST", rarity: "epic", nation: "GR", sort: "name", page: 3 });
  });

  it("ignores tampered values instead of failing", () => {
    expect(parseCollectionFilters({ position: "STRIKER", rarity: "mythic", nation: "greece", sort: "evil", page: "-4" }))
      .toEqual({ q: undefined, position: undefined, rarity: undefined, nation: undefined, sort: "overall-desc", page: 1 });
    expect(parseCollectionFilters({ q: "x".repeat(500) }).q).toBeUndefined();
  });

  it("takes the first of repeated params", () => {
    expect(parseCollectionFilters({ position: ["CB", "ST"] }).position).toBe("CB");
  });
});

describe("filtersToQuery", () => {
  it("omits defaults and round-trips", () => {
    expect(filtersToQuery({ sort: "overall-desc", page: 1 })).toBe("");
    const qs = filtersToQuery({ q: "ana", rarity: "rare", sort: "newest", page: 2 });
    expect(qs).toBe("?q=ana&rarity=rare&sort=newest&page=2");
    expect(parseCollectionFilters(Object.fromEntries(new URLSearchParams(qs)))).toMatchObject({ q: "ana", rarity: "rare", sort: "newest", page: 2 });
  });
});

describe("search helpers", () => {
  it("normalises like the database search_key()", () => {
    expect(toSearchKey("Gonçalo MOREIRÃO")).toBe("goncalo moreirao");
  });
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("parseCompareIds", () => {
  const a = "6f1b6c2e-0d5a-4c39-9a3e-5b7d2f9a1c40";
  const b = "d909889b-db5a-592d-8f44-6998a70d156c";
  it("keeps up to 3 distinct UUIDs and drops junk", () => {
    expect(parseCompareIds(`${a},${a},nope,${b}`)).toEqual([a, b]);
    expect(parseCompareIds([`${a},${b},${a},${b}`])).toEqual([a, b]);
    expect(parseCompareIds(undefined)).toEqual([]);
    expect(parseCompareIds(`${a},${b},${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)},${"1".repeat(8)}-1111-4111-8111-${"1".repeat(12)}`)).toHaveLength(3);
  });
});

describe("player helpers", () => {
  it("computes birthday-aware ages", () => {
    const now = new Date(Date.UTC(2026, 10, 23));
    expect(ageOn("1996-11-23", now)).toBe(30);
    expect(ageOn("1996-11-24", now)).toBe(29);
    expect(ageOn("2000-02-29", now)).toBe(26);
  });
  it("names countries", () => {
    expect(countryName("GR")).toBe("Greece");
    expect(countryName("GB")).toBe("United Kingdom");
  });
  it("uses goalkeeper labels for GK", () => {
    expect(statLabels("GK").map((s) => s.short)).toEqual(["DIV", "HAN", "KIC", "REF", "SPD", "POS"]);
    expect(statLabels("ST")[0]).toEqual({ key: "pace", short: "PAC", name: "Pace" });
  });
  it("parses career data defensively", () => {
    expect(parseCareer([{ from: 2015, to: 2018, club: "A", appearances: 80, goals: 3 }, { bad: true }, null, "x"]))
      .toEqual([{ from: 2015, to: 2018, club: "A", appearances: 80, goals: 3 }]);
    expect(parseCareer({ not: "array" })).toEqual([]);
  });
});
