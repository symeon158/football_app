/**
 * Challenge period buckets (UTC). Must match how the server stores
 * user_challenges.period_start: daily = the UTC date, weekly = the UTC Monday,
 * one-off challenges (team_building, milestone) = 1970-01-01.
 */
export type ChallengePeriod = "daily" | "weekly" | "team_building" | "milestone";

export const ONE_OFF_PERIOD_START = "1970-01-01";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcWeek(now: Date): Date {
  const day = startOfUtcDay(now);
  const offset = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

export function periodStart(period: ChallengePeriod, now: Date): string {
  switch (period) {
    case "daily":
      return isoDate(startOfUtcDay(now));
    case "weekly":
      return isoDate(startOfUtcWeek(now));
    default:
      return ONE_OFF_PERIOD_START;
  }
}

/** When the current period ends, or null for one-off challenges. */
export function periodEnd(period: ChallengePeriod, now: Date): Date | null {
  if (period === "daily") {
    const d = startOfUtcDay(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  if (period === "weekly") {
    const d = startOfUtcWeek(now);
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  return null;
}

/** "5h 12m", "2d 4h", "12m" — compact time remaining. */
export function formatRemaining(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
