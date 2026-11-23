import "server-only";

import { cache } from "react";

import { createClient, requireUserId } from "@/lib/supabase/server";

/**
 * The signed-in manager's identity + wallet. Wrapped in React `cache` so the
 * top bar and the page share one query per request.
 */
export const getViewer = cache(async () => {
  const userId = await requireUserId();
  const supabase = await createClient();

  const [profile, wallet] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name, avatar_key, level, xp, created_at")
      .eq("id", userId)
      .single(),
    supabase.from("wallets").select("balance").eq("user_id", userId).single(),
  ]);

  if (profile.error || wallet.error) {
    throw new Error("Could not load your manager profile.");
  }

  return {
    userId,
    ...profile.data,
    displayName: profile.data.display_name ?? profile.data.username,
    balance: wallet.data.balance,
  };
});

export type Viewer = Awaited<ReturnType<typeof getViewer>>;
