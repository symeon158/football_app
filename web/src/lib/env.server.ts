import "server-only";

import { z } from "zod";

/**
 * Server-only secrets. The `server-only` import makes the build fail if this
 * module is ever imported from a Client Component, so the secret key can
 * never reach the browser bundle.
 */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
});

export function serverEnv() {
  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
