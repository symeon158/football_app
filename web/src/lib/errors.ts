/**
 * Database functions raise stable UPPER_SNAKE codes (see supabase/migrations).
 * This maps them to user-facing text without leaking internal details.
 */
const GAME_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: "You don't have enough Football Coins for that.",
  IDEMPOTENCY_KEY_REUSED: "That request was already processed.",
  TEAM_LIMIT_REACHED: "You can save up to 5 squads.",
  TEAM_NOT_FOUND: "That squad could not be found.",
  CAPTAIN_NOT_IN_TEAM: "The captain must be one of the team's players.",
  NOT_AUTHENTICATED: "Please sign in again.",
  WALLET_NOT_FOUND: "Your wallet could not be found.",
  CAPTAIN_NOT_STARTER: "Your captain must be in the starting XI.",
  CARD_NOT_OWNED: "One of those cards isn't in your collection.",
  DUPLICATE_PLAYER: "A player can only appear once in a squad.",
  INVALID_LINEUP: "That line-up isn't valid. Please reload and try again.",
  LAST_TEAM: "You need at least one squad.",
  CARD_NOT_AVAILABLE: "That card isn't available to buy.",
  COLLECTION_FULL: "Your collection is full (500 cards).",
  PACK_NOT_AVAILABLE: "That pack isn't available.",
  PACK_LIMIT_REACHED: "You've reached today's limit for this pack. Try again tomorrow.",
  INVALID_IDEMPOTENCY_KEY: "That request was malformed. Please try again.",
  STADIUM_LEVEL_CHANGED: "Your stadium changed in the meantime. Please review the new level and try again.",
  STADIUM_MAX_LEVEL: "That part of your stadium is already at the maximum level.",
  STADIUM_NOT_FOUND: "Your stadium could not be found.",
  MATCH_COOLDOWN: "Catch your breath — you can kick off again in a few seconds.",
  MATCH_DAILY_LIMIT: "That's all the matches for today. Come back tomorrow!",
  INVALID_MATCH: "The match could not be recorded. Please try again.",
  NOT_COMPLETED: "Not finished yet — keep going!",
  ALREADY_CLAIMED: "You've already claimed this reward.",
  CHALLENGE_NOT_FOUND: "That challenge isn't available any more.",
  ACHIEVEMENT_NOT_FOUND: "That achievement doesn't exist.",
  INVALID_LEADERBOARD: "That leaderboard doesn't exist.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function toUserMessage(error: { message?: string } | null | undefined): string {
  if (!error?.message) return DEFAULT_MESSAGE;
  const code = error.message.trim();
  return GAME_ERROR_MESSAGES[code] ?? DEFAULT_MESSAGE;
}
