const integer = new Intl.NumberFormat("en-GB");
const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });

export const formatNumber = (n: number) => integer.format(n);

/** 1,000 → "1,000"; 12,500 → "12.5K" when `short` is set. */
export const formatCoins = (n: number, short = false) =>
  short && Math.abs(n) >= 10_000 ? compact.format(n) : integer.format(n);

export function displayName(p: { first_name: string; last_name: string; known_as?: string | null }) {
  return p.known_as ?? `${p.first_name} ${p.last_name}`;
}

/** Card names: "R. Stanmore" (keeps multi-word surnames intact). */
export function shortName(p: { first_name: string; last_name: string; known_as?: string | null }) {
  return p.known_as ?? `${p.first_name.charAt(0)}. ${p.last_name}`;
}

export function initials(name: string) {
  const parts = name.replace(/_/g, " ").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
