/**
 * Shown when a user id can't be resolved to a profile. Matches the
 * fallback the database applies in profile_display_name_for(), so the two
 * layers can't disagree about what an unnameable person is called.
 *
 * Reachable in practice when a profile row exists but RLS hides it — a
 * former household member still referenced by items.added_by, say. The
 * point is that it's never the raw uuid: an id on screen is a bug, and
 * "Someone" is the honest answer to "who was this?".
 */
export const UNKNOWN_DISPLAY_NAME = "Someone";

/**
 * Resolves one user id against a map of already-fetched display names.
 * Pure, so the fallback behaviour is testable without a database.
 */
export function displayNameFor(userId: string | null | undefined, names: ReadonlyMap<string, string>): string {
  if (!userId) {
    return UNKNOWN_DISPLAY_NAME;
  }
  return names.get(userId) ?? UNKNOWN_DISPLAY_NAME;
}

/**
 * The first word of a display name, for the meta lines ("Noa, 3 days ago") —
 * the brand voice uses first names. Undefined for a missing or blank name,
 * so a caller can leave the name out instead of printing a placeholder.
 */
export function firstNameOf(displayName: string | null | undefined): string | undefined {
  const first = displayName?.trim().split(/\s+/)[0];
  return first === undefined || first === "" ? undefined : first;
}
