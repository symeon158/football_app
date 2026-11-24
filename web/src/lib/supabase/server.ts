import "server-only";

import { createServerClient } from "@supabase/ssr";
import { navigation } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export const SUPABASE_TIMEOUT_MS = 10_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
}

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user, so every query is subject to RLS.
 */
export async function createClient() {
  // Never create an auth client during a prerender. createServerClient()
  // subscribes to auth state, which starts a detached task that calls
  // Date.now(); inside a prerender phase Next.js rejects that and the
  // streamed render never completes (observed as pages hanging after the
  // static shell). connection() guarantees we only run at request time.
  await connection();
  const env = publicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // Bound every Supabase call so a slow network/backend can never hang a
      // render: a timed-out read surfaces in the error boundary, and a
      // timed-out write is safe to retry (purchases/upgrades are idempotent).
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: the proxy refreshes the session on every request.
          }
        },
      },
    },
  );
}

/**
 * Returns the verified user id from the session JWT, or null.
 * getClaims() validates the token signature — never trust getSession() alone.
 */
export async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
}

/**
 * Authoritative auth check for protected pages (call from Server Components;
 * server actions should use getUserId() and handle null themselves).
 * (The proxy's redirect is only an optimistic UX shortcut.)
 */
export async function requireUserId(): Promise<string> {
  // Session work happens on navigation, never in (static) prefetches.
  await navigation();
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return userId;
}
