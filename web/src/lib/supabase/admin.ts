import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Privileged client using the secret (service-role) key. BYPASSES RLS.
 * Only for trusted server code that has already authorised the caller, e.g.
 * future scheduled jobs. Never import from client code (enforced by
 * `server-only`). Prefer user-scoped clients + SECURITY DEFINER RPCs.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
