/** Routes that require a signed-in user (the whole game). */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/club",
  "/collection",
  "/players",
  "/team",
  "/stadium",
  "/marketplace",
  "/matches",
  "/challenges",
  "/leaderboards",
  "/profile",
  "/managers",
  "/settings",
] as const;

const AUTH_PATHS = ["/login", "/signup"] as const;

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => matches(pathname, p));
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => matches(pathname, p));
}

/**
 * Validates a post-login redirect target. Only same-site absolute paths are
 * allowed, preventing open redirects such as `//evil.com` or `https://…`.
 */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}
