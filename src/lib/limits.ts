/**
 * Household limits (ADR 0015). The database enforces every one of these —
 * see supabase/migrations/*_household_limits.sql — and the numbers here are
 * the UI's copy of them. Change both together.
 */

/** Things one household can track. */
export const ITEM_LIMIT = 100;
/** Places one household can have, at any depth. */
export const PLACE_LIMIT = 100;
/** Places on one path, top level included: `Garage › Closet › … ` holds at most 8. */
export const DEPTH_LIMIT = 8;

/** Maximum lengths in characters (Postgres `char_length`, i.e. code points). */
export const TEXT_LIMITS = {
  itemName: 80,
  detail: 500,
  placeName: 60,
  householdName: 50,
  displayName: 50,
} as const;

/** The custom SQLSTATE each limit raises (ADR 0015). Length overruns stay 23514. */
export const LIMIT_ERROR_CODES = {
  itemLimit: "SL001",
  placeLimit: "SL002",
  depthLimit: "SL003",
  alreadyInHousehold: "SL004",
  householdFull: "SL005",
} as const;

/**
 * Cuts `text` to at most `max` characters, counting code points the way
 * Postgres' `char_length` does (so an emoji is one character, not two
 * UTF-16 units), and trims whatever whitespace the cut leaves at the end.
 */
export function clampToLength(text: string, max: number): string {
  const codePoints = Array.from(text);
  return codePoints.length <= max ? text : codePoints.slice(0, max).join("").trimEnd();
}
