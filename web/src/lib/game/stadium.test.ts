import { describe, expect, it } from "vitest";

import { capacityFor, costToMax, homeBonus, matchdayIncome, nextUpgrade, stadiumLevel, type UpgradeCost } from "./stadium";

// Mirrors supabase/migrations/20261123000400_reference_data.sql.
const COSTS: UpgradeCost[] = [
  ["seating", 2, 500, 0.5], ["seating", 3, 1500, 1], ["seating", 4, 4000, 1.5], ["seating", 5, 10000, 2],
  ["lighting", 2, 300, 0.25], ["lighting", 3, 900, 0.5], ["lighting", 4, 2500, 0.75], ["lighting", 5, 6000, 1],
  ["pitch", 2, 400, 0.5], ["pitch", 3, 1200, 1], ["pitch", 4, 3000, 1.5], ["pitch", 5, 8000, 2],
  ["facilities", 2, 350, 0.25], ["facilities", 3, 1000, 0.5], ["facilities", 4, 2800, 0.75], ["facilities", 5, 7000, 1],
].map(([category, level, cost, bonus_pct]) => ({ category, level, cost, bonus_pct, description: "" }) as UpgradeCost);

const base = { seating: 1, lighting: 1, pitch: 1, facilities: 1 };
const maxed = { seating: 5, lighting: 5, pitch: 5, facilities: 5 };

describe("stadium rules", () => {
  it("capacity matches the database formula and clamps", () => {
    expect([1, 2, 3, 4, 5].map(capacityFor)).toEqual([5000, 12000, 25000, 45000, 70000]);
    expect(capacityFor(0)).toBe(5000);
    expect(capacityFor(9)).toBe(70000);
  });

  it("stadium level is the floored average", () => {
    expect(stadiumLevel(base)).toBe(1);
    expect(stadiumLevel({ seating: 3, lighting: 2, pitch: 2, facilities: 2 })).toBe(2);
    expect(stadiumLevel({ seating: 5, lighting: 5, pitch: 5, facilities: 4 })).toBe(4);
    expect(stadiumLevel(maxed)).toBe(5);
  });

  it("home bonus sums reached levels, 0 at base and 15% maxed", () => {
    expect(homeBonus(base, COSTS)).toBe(0);
    expect(homeBonus({ ...base, seating: 3 }, COSTS)).toBe(1.5);
    expect(homeBonus(maxed, COSTS)).toBe(15);
  });

  it("finds the next upgrade and the cost to max out", () => {
    expect(nextUpgrade("pitch", 1, COSTS)?.cost).toBe(400);
    expect(nextUpgrade("pitch", 5, COSTS)).toBeNull();
    expect(costToMax(maxed, COSTS)).toBe(0);
    expect(costToMax(base, COSTS)).toBe(COSTS.reduce((s, c) => s + c.cost, 0));
  });

  it("matchday income scales with capacity", () => {
    expect(matchdayIncome(5000)).toBe(50);
    expect(matchdayIncome(70000)).toBe(700);
  });
});
