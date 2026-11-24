import type { PlayerCardData } from "@/components/game/player-card";
import { GK_STAT_LABELS, OUTFIELD_STAT_LABELS, type Rarity } from "@/lib/game/rarity";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** ISO 3166-1 alpha-2 → "Greece". Falls back to the code. */
export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Age in whole years on `now` (birthday-aware). */
export function ageOn(birthDate: string, now: Date): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const before = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (before) age--;
  return age;
}

export const STAT_KEYS = ["pace", "shooting", "passing", "dribbling", "defending", "physicality"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

const OUTFIELD_NAMES = ["Pace", "Shooting", "Passing", "Dribbling", "Defending", "Physical"];
const GK_NAMES = ["Diving", "Handling", "Kicking", "Reflexes", "Speed", "Positioning"];

/** Face-stat labels for a position (goalkeepers reuse the six columns). */
export function statLabels(position: string) {
  const gk = position === "GK";
  return STAT_KEYS.map((key, i) => ({
    key,
    short: (gk ? GK_STAT_LABELS : OUTFIELD_STAT_LABELS)[i],
    name: (gk ? GK_NAMES : OUTFIELD_NAMES)[i],
  }));
}

/** A flat card row as returned by the card_catalog / my_collection views (all columns nullable). */
export type CardRow = {
  rarity: Rarity | null;
  position: string | null;
  overall: number | null;
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  dribbling: number | null;
  defending: number | null;
  physicality: number | null;
  first_name: string | null;
  last_name: string | null;
  known_as: string | null;
  nationality: string | null;
  club: string | null;
};

/** Flat view row → the PlayerCard's nested shape. */
export function toCardData(r: CardRow): PlayerCardData {
  return {
    rarity: r.rarity ?? "common",
    position: r.position ?? "",
    overall: r.overall ?? 0,
    pace: r.pace ?? 0,
    shooting: r.shooting ?? 0,
    passing: r.passing ?? 0,
    dribbling: r.dribbling ?? 0,
    defending: r.defending ?? 0,
    physicality: r.physicality ?? 0,
    player: {
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      known_as: r.known_as,
      nationality: r.nationality ?? "",
      club: r.club ?? "",
    },
  };
}

export type CareerEntry = { from: number; to: number; club: string; appearances: number; goals: number };

/** Validates the jsonb career array defensively (licensed data may be messier). */
export function parseCareer(raw: unknown): CareerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const { from, to, club, appearances, goals } = e as Record<string, unknown>;
    if (typeof from !== "number" || typeof club !== "string") return [];
    return [{
      from,
      to: typeof to === "number" ? to : from,
      club,
      appearances: typeof appearances === "number" ? appearances : 0,
      goals: typeof goals === "number" ? goals : 0,
    }];
  });
}
