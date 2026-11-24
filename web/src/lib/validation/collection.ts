import { z } from "zod";

import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

export const POSITIONS = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"] as const satisfies readonly Enums["player_position"][];
export const RARITY_VALUES = ["common", "rare", "epic", "legendary", "icon"] as const satisfies readonly Enums["card_rarity"][];

export const SORTS = {
  "overall-desc": { label: "Highest rated", column: "overall", ascending: false },
  "overall-asc": { label: "Lowest rated", column: "overall", ascending: true },
  newest: { label: "Newest first", column: "acquired_at", ascending: false },
  name: { label: "Name A–Z", column: "display_name", ascending: true },
  position: { label: "Position", column: "position", ascending: true },
} as const;
export type SortKey = keyof typeof SORTS;

export const PAGE_SIZE = 24;

/** Invalid or unknown values fall back to "no filter" instead of erroring — URLs are user-editable. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);

const firstValue = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const collectionFiltersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(40)
    .optional()
    .catch(undefined)
    .transform((v) => (v ? v : undefined)),
  position: optionalEnum(POSITIONS),
  rarity: optionalEnum(RARITY_VALUES),
  nation: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  sort: z.enum(Object.keys(SORTS) as [SortKey, ...SortKey[]]).catch("overall-desc").default("overall-desc"),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});

export type CollectionFilters = z.infer<typeof collectionFiltersSchema>;

export function parseCollectionFilters(params: Record<string, string | string[] | undefined>): CollectionFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, firstValue(v)]));
  return collectionFiltersSchema.parse(flat);
}

/** Builds a query string, dropping defaults so URLs stay short and canonical. */
export function filtersToQuery(f: Partial<CollectionFilters>): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.position) params.set("position", f.position);
  if (f.rarity) params.set("rarity", f.rarity);
  if (f.nation) params.set("nation", f.nation);
  if (f.sort && f.sort !== "overall-desc") params.set("sort", f.sort);
  if (f.page && f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Same normalisation as public.search_key() in the database. */
export function toSearchKey(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const uuidSchema = z.uuid();

/** ?ids=a,b,c → up to 3 distinct valid UUIDs. */
export function parseCompareIds(raw: unknown): string[] {
  const value = firstValue(raw);
  if (typeof value !== "string") return [];
  const ids = value.split(",").map((s) => s.trim()).filter((s) => uuidSchema.safeParse(s).success);
  return [...new Set(ids)].slice(0, 3);
}
