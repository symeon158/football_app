import type { Database } from "@/types/database";

/**
 * Stadium rules. Capacity and level mirror the generated columns on
 * public.stadiums (tested); bonuses and income feed the Phase 7 match engine.
 */
export type StadiumCategory = Database["public"]["Enums"]["stadium_upgrade_category"];
export const CATEGORIES: StadiumCategory[] = ["seating", "lighting", "pitch", "facilities"];
export const MAX_STADIUM_LEVEL = 5;

export const DESIGNS = ["classic", "modern", "bowl", "fortress"] as const;
export type StadiumDesign = (typeof DESIGNS)[number];
export const DESIGN_INFO: Record<StadiumDesign, { label: string; description: string }> = {
  classic: { label: "Classic", description: "Traditional slate stands and steel roof." },
  modern: { label: "Modern", description: "Glass and light, built for broadcast." },
  bowl: { label: "Bowl", description: "A continuous ring of seats close to the pitch." },
  fortress: { label: "Fortress", description: "Red-brick terraces that roar." },
};

export type StadiumLevels = Record<StadiumCategory, number>;

/** Must match the CASE in public.stadiums.capacity. */
export const CAPACITY_BY_SEATING = [5000, 12000, 25000, 45000, 70000] as const;

export function capacityFor(seatingLevel: number): number {
  const i = Math.max(1, Math.min(MAX_STADIUM_LEVEL, Math.floor(seatingLevel))) - 1;
  return CAPACITY_BY_SEATING[i];
}

/** Must match public.stadiums.stadium_level: integer average of the four levels. */
export function stadiumLevel(levels: StadiumLevels): number {
  return Math.floor((levels.seating + levels.lighting + levels.pitch + levels.facilities) / 4);
}

export type UpgradeCost = { category: StadiumCategory; level: number; cost: number; bonus_pct: number; description: string };

/**
 * Home advantage in percent: the sum of the bonuses of every level reached
 * (level 1 is the base and gives nothing). Max 15% with everything at 5.
 */
export function homeBonus(levels: StadiumLevels, costs: UpgradeCost[]): number {
  const total = costs
    .filter((c) => c.level <= levels[c.category])
    .reduce((sum, c) => sum + Number(c.bonus_pct), 0);
  return Math.round(total * 100) / 100;
}

/** Coins earned per home match from ticket sales (used by Phase 7 rewards). */
export function matchdayIncome(capacity: number): number {
  return Math.round(capacity / 100);
}

export function nextUpgrade(category: StadiumCategory, level: number, costs: UpgradeCost[]): UpgradeCost | null {
  if (level >= MAX_STADIUM_LEVEL) return null;
  return costs.find((c) => c.category === category && c.level === level + 1) ?? null;
}

/** Total FC still needed to max out everything (shown as a goal). */
export function costToMax(levels: StadiumLevels, costs: UpgradeCost[]): number {
  return costs.filter((c) => c.level > levels[c.category]).reduce((s, c) => s + c.cost, 0);
}
