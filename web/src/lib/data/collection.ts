import "server-only";

import { countryName } from "@/lib/game/player";
import { RARITIES, type Rarity } from "@/lib/game/rarity";
import { createClient } from "@/lib/supabase/server";
import {
  escapeLike,
  PAGE_SIZE,
  SORTS,
  toSearchKey,
  type CollectionFilters,
} from "@/lib/validation/collection";

const CARD_COLUMNS =
  "card_id, rarity, position, overall, pace, shooting, passing, dribbling, defending, physicality, first_name, last_name, known_as, nationality, club, display_name";

/**
 * One page of the signed-in user's collection plus facet counts for the
 * filter bar. Runs as the user: `my_collection` is security_invoker, so RLS on
 * card_ownership restricts it to their own cards (the user_id filter is just
 * for the index).
 */
export async function getCollection(userId: string, f: CollectionFilters) {
  const supabase = await createClient();
  const sort = SORTS[f.sort];

  let query = supabase
    .from("my_collection")
    .select(`ownership_id, is_starter, acquired_at, ${CARD_COLUMNS}`, { count: "exact" })
    .eq("user_id", userId);
  if (f.q) query = query.ilike("search_name", `%${escapeLike(toSearchKey(f.q))}%`);
  if (f.position) query = query.eq("position", f.position);
  if (f.rarity) query = query.eq("rarity", f.rarity);
  if (f.nation) query = query.eq("nationality", f.nation);

  const from = (f.page - 1) * PAGE_SIZE;
  const [page, facets] = await Promise.all([
    query
      .order(sort.column, { ascending: sort.ascending })
      .order("overall", { ascending: false })
      .order("ownership_id")
      .range(from, from + PAGE_SIZE - 1),
    supabase.from("my_collection").select("rarity, nationality, player_id").eq("user_id", userId),
  ]);

  if (page.error) throw new Error(`Failed to load collection: ${page.error.message}`);
  if (facets.error) throw new Error(`Failed to load collection stats: ${facets.error.message}`);

  const all = facets.data ?? [];
  const rarityCounts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  const nationCounts = new Map<string, number>();
  for (const row of all) {
    if (row.rarity) rarityCounts[row.rarity]++;
    if (row.nationality) nationCounts.set(row.nationality, (nationCounts.get(row.nationality) ?? 0) + 1);
  }

  const total = page.count ?? 0;
  return {
    cards: page.data ?? [],
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    stats: {
      owned: all.length,
      uniquePlayers: new Set(all.map((r) => r.player_id)).size,
      rarityCounts,
    },
    nations: [...nationCounts]
      .map(([code, count]) => ({ code, name: countryName(code), count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type CollectionPage = Awaited<ReturnType<typeof getCollection>>;

/** Public card details + the viewer's copies of it. Returns null if unknown. */
export async function getCardDetail(userId: string, cardId: string) {
  const supabase = await createClient();
  const [card, copies] = await Promise.all([
    supabase.from("card_catalog").select("*").eq("card_id", cardId).maybeSingle(),
    supabase
      .from("my_collection")
      .select("ownership_id, is_starter, acquired_at, acquired_via")
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .order("acquired_at"),
  ]);
  if (card.error) throw new Error(`Failed to load card: ${card.error.message}`);
  if (copies.error) throw new Error(`Failed to load your copies: ${copies.error.message}`);
  if (!card.data) return null;

  const editions = await supabase
    .from("card_catalog")
    .select("card_id, edition, rarity, overall")
    .eq("player_id", card.data.player_id!)
    .neq("card_id", cardId)
    .order("overall", { ascending: false });

  return { card: card.data, copies: copies.data ?? [], otherEditions: editions.data ?? [] };
}

export type CardDetail = NonNullable<Awaited<ReturnType<typeof getCardDetail>>>;

/** Cards to compare (in requested order) + the viewer's collection as picker options. */
export async function getComparison(userId: string, ids: string[]) {
  const supabase = await createClient();
  const [cards, options] = await Promise.all([
    ids.length
      ? supabase.from("card_catalog").select(`${CARD_COLUMNS}, weak_foot, skill_moves, preferred_foot, birth_date, height_cm, market_price`).in("card_id", ids)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("my_collection")
      .select("card_id, display_name, overall, position, rarity")
      .eq("user_id", userId)
      .order("overall", { ascending: false }),
  ]);
  if (cards.error) throw new Error(`Failed to load cards: ${cards.error.message}`);
  if (options.error) throw new Error(`Failed to load your collection: ${options.error.message}`);

  const byId = new Map((cards.data ?? []).map((c) => [c.card_id, c]));
  const seen = new Set<string>();
  return {
    cards: ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c)),
    options: (options.data ?? []).filter((o) => o.card_id && !seen.has(o.card_id) && seen.add(o.card_id)),
  };
}

export type Comparison = Awaited<ReturnType<typeof getComparison>>;
