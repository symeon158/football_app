/**
 * Manager levels. Total XP needed to *reach* level L is 50·L·(L−1):
 *   L2 = 100, L3 = 300, L4 = 600, L5 = 1,000, L10 = 4,500 …
 * The stored `profiles.level` is authoritative (written server-side); these
 * helpers derive progress for display and will back the Phase 8 award logic.
 */
export const MAX_LEVEL = 99;

export function totalXpForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 50 * l * (l - 1);
}

export function levelForXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  // Inverse of 50·L·(L−1) = xp, then guard against float rounding.
  let level = Math.floor((1 + Math.sqrt(1 + safe / 12.5)) / 2);
  level = Math.max(1, Math.min(MAX_LEVEL, level));
  while (level < MAX_LEVEL && totalXpForLevel(level + 1) <= safe) level++;
  while (level > 1 && totalXpForLevel(level) > safe) level--;
  return level;
}

export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number; // size of the current level band
  percent: number; // 0–100
  isMax: boolean;
};

export function levelProgress(xp: number, level = levelForXp(xp)): LevelProgress {
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, xpIntoLevel: 0, xpForNextLevel: 0, percent: 100, isMax: true };
  }
  const floor = totalXpForLevel(level);
  const band = totalXpForLevel(level + 1) - floor;
  const into = Math.max(0, Math.min(band, xp - floor));
  return {
    level,
    xpIntoLevel: into,
    xpForNextLevel: band,
    percent: Math.round((into / band) * 100),
    isMax: false,
  };
}
