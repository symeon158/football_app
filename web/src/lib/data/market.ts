import "server-only";

import { countryName } from "@/lib/game/player";
import { createClient } from "@/lib/supabase/server";
import { escapeLike, toSearchKey } from "@/lib/validation/collection";
import { MARKET_PAGE_SIZE, MARKET_SORTS, type MarketFilters } from "@/lib/validation/market";

const CARD_COLUMNS =
  "card_id, rarity, position, overall, pace, shooting, passing, dribbling, defending, physicality, first_name, last_name, known_as, nationality, club, display_name, market_price";

/** One page of purchasable cards, plus how many copies the viewer owns of each. */
export async function getMarket(userId: string, f: MarketFilters) {
  const supabase = await createClient();
  const sort = MARKET_SORTS[f.sort];

  let query = supabase.from("card_catalog").select(CARD_COLUMNS, { count: "exact" }).eq("is_purchasable", true);
  if (f.q) query = query.ilike("search_name", `%${escapeLike(toSearchKey(f.q))}%`);
  if (f.position) query = query.eq("position", f.position);
  if (f.rarity) query = query.eq("rarity", f.rarity);
  if (f.nation) query = query.eq("nationality", f.nation);
  if (f.min) query = query.gte("overall", f.min);

  const from = (f.page - 1) * MARKET_PAGE_SIZE;
  const [page, nations] = await Promise.all([
    query
      .order(sort.column, { ascending: sort.ascending })
      .order("overall", { ascending: false })
      .order("card_id")
      .range(from, from + MARKET_PAGE_SIZE - 1),
    supabase.from("card_catalog").select("nationality").eq("is_purchasable", true),
  ]);
  if (page.error) throw new Error(`Failed to load marketplace: ${page.error.message}`);
  if (nations.error) throw new Error(`Failed to load nations: ${nations.error.message}`);

  const ids = (page.data ?? []).map((c) => c.card_id);
  const owned = new Map<string, number>();
  if (ids.length) {
    const { data, error } = await supabase.from("my_collection").select("card_id").eq("user_id", userId).in("card_id", ids);
    if (error) throw new Error(`Failed to load owned cards: ${error.message}`);
    for (const r of data ?? []) owned.set(r.card_id, (owned.get(r.card_id) ?? 0) + 1);
  }

  const total = page.count ?? 0;
  return {
    cards: (page.data ?? []).map((c) => ({ ...c, owned: owned.get(c.card_id) ?? 0 })),
    total,
    pageCount: Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)),
    nations: [...new Set((nations.data ?? []).map((n) => n.nationality))]
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Active packs with their published odds and the viewer's openings today. */
export async function getPacks(userId: string, now: Date) {
  const supabase = await createClient();
  const [packs, today] = await Promise.all([
    supabase
      .from("card_packs")
      .select("id, code, name, description, price, cards_per_pack, guaranteed_rarity, daily_limit, card_pack_odds(rarity, weight)")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("pack_openings").select("pack_id").eq("user_id", userId).gte("created_at", startOfUtcDay(now)),
  ]);
  if (packs.error) throw new Error(`Failed to load packs: ${packs.error.message}`);
  if (today.error) throw new Error(`Failed to load pack history: ${today.error.message}`);
  const openedToday = new Map<string, number>();
  for (const o of today.data ?? []) openedToday.set(o.pack_id, (openedToday.get(o.pack_id) ?? 0) + 1);
  return (packs.data ?? []).map((p) => ({ ...p, openedToday: openedToday.get(p.id) ?? 0 }));
}

export type Pack = Awaited<ReturnType<typeof getPacks>>[number];

/** A pack opening the viewer made, with its cards in draw order (RLS: own only). */
export async function getOpening(openingId: string) {
  const supabase = await createClient();
  const [opening, cards] = await Promise.all([
    supabase.from("pack_openings").select("id, created_at, price_paid, pack:card_packs!inner(id, name, code)").eq("id", openingId).maybeSingle(),
    supabase
      .from("card_ownership")
      .select(
        "id, pack_position, card:player_cards!inner(id, rarity, position, overall, pace, shooting, passing, dribbling, defending, physicality, player:players!inner(first_name, last_name, known_as, nationality, club))",
      )
      .eq("pack_opening_id", openingId)
      .order("pack_position"),
  ]);
  if (opening.error) throw new Error(`Failed to load pack: ${opening.error.message}`);
  if (cards.error) throw new Error(`Failed to load pack cards: ${cards.error.message}`);
  if (!opening.data) return null;
  return { ...opening.data, cards: cards.data ?? [] };
}

const TX_LABELS: Record<string, string> = {
  signup_bonus: "Welcome bonus",
  match_reward: "Match reward",
  challenge_reward: "Challenge reward",
  achievement_reward: "Achievement reward",
  card_purchase: "Bought player",
  pack_purchase: "Opened pack",
  stadium_upgrade: "Stadium upgrade",
  admin_adjustment: "Adjustment",
};

export const HISTORY_PAGE_SIZE = 25;

/** The viewer's coin ledger, newest first, with human-readable descriptions. */
export async function getTransactions(userId: string, page: number) {
  const supabase = await createClient();
  const from = (page - 1) * HISTORY_PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("coin_transactions")
    .select("id, amount, balance_after, tx_type, reference_type, reference_id, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + HISTORY_PAGE_SIZE - 1);
  if (error) throw new Error(`Failed to load transactions: ${error.message}`);

  const rows = data ?? [];
  const cardIds = rows.filter((r) => r.reference_type === "player_card" && r.reference_id).map((r) => r.reference_id!);
  const packIds = rows.filter((r) => r.reference_type === "card_pack" && r.reference_id).map((r) => r.reference_id!);
  const [cards, packs] = await Promise.all([
    cardIds.length ? supabase.from("card_catalog").select("card_id, display_name").in("card_id", cardIds) : Promise.resolve({ data: [] }),
    packIds.length ? supabase.from("card_packs").select("id, name").in("id", packIds) : Promise.resolve({ data: [] }),
  ]);
  const names = new Map<string, string>([
    ...(cards.data ?? []).map((c) => [c.card_id, c.display_name ?? "Player"] as [string, string]),
    ...(packs.data ?? []).map((p) => [p.id, p.name] as [string, string]),
  ]);

  return {
    rows: rows.map((r) => ({
      ...r,
      label: TX_LABELS[r.tx_type] ?? r.tx_type,
      detail: r.reference_id ? names.get(r.reference_id) ?? null : null,
    })),
    pageCount: Math.max(1, Math.ceil((count ?? 0) / HISTORY_PAGE_SIZE)),
  };
}
