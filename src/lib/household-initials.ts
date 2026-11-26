/** Shown when the owner's name is unknown (still loading, unreadable, or blank). */
export const FALLBACK_INITIALS = "H";

/**
 * The letter on the household button: the first letter or digit of the
 * owner's name, uppercased ("Noa Levi" → "N", "“jane”" → "J"). It comes
 * from the owner, never from a name someone gives the household, so it is
 * always one letter: two visible letters that aren't in the button's
 * accessible name ("Household menu") would trip axe's
 * label-content-name-mismatch (WCAG 2.5.3). Pure, so the edge cases (blank,
 * punctuation, emoji-leading names) are testable without rendering.
 */
export function householdInitials(ownerDisplayName: string | null | undefined): string {
  const letter = /[\p{L}\p{N}]/u.exec(ownerDisplayName ?? "")?.[0];
  return letter === undefined ? FALLBACK_INITIALS : letter.toLocaleUpperCase();
}
