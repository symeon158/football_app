import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Loads the signed-in user's club overview. Every query runs as the user, so
 * RLS guarantees only their own private data is returned.
 */
export async function getClubOverview(userId: string) {
  const supabase = await createClient();

  const [profile, wallet, stadium, team, cards] = await Promise.all([
    supabase.from("profiles").select("username, display_name, level, xp").eq("id", userId).single(),
    supabase.from("wallets").select("balance").eq("user_id", userId).single(),
    supabase.from("stadiums").select("name, capacity, stadium_level").eq("user_id", userId).single(),
    supabase
      .from("teams")
      .select("id, name, formation, tactic, captain_ownership_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("card_ownership")
      .select(
        "id, acquired_at, card:player_cards!inner(rarity, position, overall, player:players!inner(first_name, last_name, nationality))",
      )
      .eq("user_id", userId)
      .order("acquired_at", { ascending: false }),
  ]);

  const firstError = [profile, wallet, stadium, team, cards].find((r) => r.error)?.error;
  if (firstError) throw new Error(`Failed to load club overview: ${firstError.message}`);

  const ownedCards = (cards.data ?? []).sort((a, b) => b.card.overall - a.card.overall);

  return {
    profile: profile.data!,
    balance: wallet.data!.balance,
    stadium: stadium.data!,
    team: team.data,
    cards: ownedCards,
  };
}

export type ClubOverview = Awaited<ReturnType<typeof getClubOverview>>;
