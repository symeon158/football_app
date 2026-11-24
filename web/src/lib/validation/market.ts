import { z } from "zod";

import { POSITIONS, RARITY_VALUES } from "./collection";

export const MARKET_SORTS = {
  "overall-desc": { label: "Highest rated", column: "overall", ascending: false },
  "price-asc": { label: "Price: low to high", column: "market_price", ascending: true },
  "price-desc": { label: "Price: high to low", column: "market_price", ascending: false },
  name: { label: "Name A–Z", column: "display_name", ascending: true },
} as const;
export type MarketSortKey = keyof typeof MARKET_SORTS;

export const MIN_RATINGS = [60, 70, 75, 80, 85, 90] as const;
export const MARKET_PAGE_SIZE = 24;

const firstValue = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const marketFiltersSchema = z.object({
  q: z.string().trim().max(40).optional().catch(undefined).transform((v) => (v ? v : undefined)),
  position: z.enum(POSITIONS).optional().catch(undefined),
  rarity: z.enum(RARITY_VALUES).optional().catch(undefined),
  nation: z.string().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  min: z
    .string()
    .transform(Number)
    .refine((n) => (MIN_RATINGS as readonly number[]).includes(n))
    .optional()
    .catch(undefined),
  sort: z.enum(Object.keys(MARKET_SORTS) as [MarketSortKey, ...MarketSortKey[]]).catch("overall-desc").default("overall-desc"),
  page: z.coerce.number().int().min(1).max(1000).catch(1).default(1),
});

export type MarketFilters = z.infer<typeof marketFiltersSchema>;

export function parseMarketFilters(params: Record<string, string | string[] | undefined>): MarketFilters {
  return marketFiltersSchema.parse(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, firstValue(v)])));
}

export function marketFiltersToQuery(f: Partial<MarketFilters>): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.position) params.set("position", f.position);
  if (f.rarity) params.set("rarity", f.rarity);
  if (f.nation) params.set("nation", f.nation);
  if (f.min) params.set("min", String(f.min));
  if (f.sort && f.sort !== "overall-desc") params.set("sort", f.sort);
  if (f.page && f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Client-generated, URL-safe idempotency key accepted by buy_card / open_pack. */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Basis points → "12.5%" / "0.5%" / "<0.01%". */
export function formatOdds(weight: number): string {
  if (weight <= 0) return "0%";
  const pct = weight / 100;
  if (pct < 0.01) return "<0.01%";
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}
