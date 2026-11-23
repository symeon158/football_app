import { describe, expect, it } from "vitest";

import { formatRemaining, periodEnd, periodStart } from "./periods";
import { levelForXp, levelProgress, MAX_LEVEL, totalXpForLevel } from "./progression";
import { effectiveRating, teamOverall, type Starter } from "./team-rating";

describe("progression", () => {
  it("has the documented thresholds", () => {
    expect([1, 2, 3, 4, 5, 10].map(totalXpForLevel)).toEqual([0, 100, 300, 600, 1000, 4500]);
  });

  it.each([
    [0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [4499, 9], [4500, 10],
  ])("xp %i → level %i", (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });

  it("levelForXp is the inverse of totalXpForLevel for every level", () => {
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelForXp(totalXpForLevel(l))).toBe(l);
      if (l > 1) expect(levelForXp(totalXpForLevel(l) - 1)).toBe(l - 1);
    }
  });

  it("caps at max level and handles bad input", () => {
    expect(levelForXp(10 ** 12)).toBe(MAX_LEVEL);
    expect(levelForXp(-50)).toBe(1);
    expect(levelProgress(10 ** 12).isMax).toBe(true);
  });

  it("reports progress within the level band", () => {
    expect(levelProgress(200)).toEqual({ level: 2, xpIntoLevel: 100, xpForNextLevel: 200, percent: 50, isMax: false });
  });
});

describe("team rating", () => {
  const s = (slotPosition: Starter["slotPosition"], cardPosition: Starter["cardPosition"], overall: number): Starter => ({
    slotPosition, cardPosition, overall,
  });

  it("applies position penalties", () => {
    expect(effectiveRating(s("ST", "ST", 80))).toBe(80);
    expect(effectiveRating(s("ST", "CAM", 80))).toBe(72);
    expect(effectiveRating(s("ST", "CB", 80))).toBe(60);
    expect(effectiveRating(s("GK", "ST", 80))).toBe(24);
  });

  it("averages the XI and penalises missing players", () => {
    const xi = Array.from({ length: 11 }, () => s("CM", "CM", 70));
    expect(teamOverall(xi)).toBe(70);
    expect(teamOverall(xi.slice(0, 10))).toBe(64);
    expect(teamOverall([])).toBe(0);
  });
});

describe("challenge periods", () => {
  // Wednesday 2026-11-25 15:30 UTC
  const now = new Date(Date.UTC(2026, 10, 25, 15, 30));

  it("buckets daily, weekly and one-off challenges", () => {
    expect(periodStart("daily", now)).toBe("2026-11-25");
    expect(periodStart("weekly", now)).toBe("2026-11-23");
    expect(periodStart("milestone", now)).toBe("1970-01-01");
  });

  it("treats Sunday as the end of the ISO week", () => {
    expect(periodStart("weekly", new Date(Date.UTC(2026, 10, 29, 23, 59)))).toBe("2026-11-23");
    expect(periodStart("weekly", new Date(Date.UTC(2026, 10, 30, 0, 0)))).toBe("2026-11-30");
  });

  it("computes period ends", () => {
    expect(periodEnd("daily", now)?.toISOString()).toBe("2026-11-26T00:00:00.000Z");
    expect(periodEnd("weekly", now)?.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(periodEnd("team_building", now)).toBeNull();
  });

  it("formats remaining time", () => {
    expect(formatRemaining(8.5 * 3600_000)).toBe("8h 30m");
    expect(formatRemaining(4.5 * 86400_000)).toBe("4d 12h");
    expect(formatRemaining(90_000)).toBe("1m");
    expect(formatRemaining(-5)).toBe("0m");
  });
});
