/** Shown when the household's name is unknown (still loading, unreadable, or blank). */
export const FALLBACK_INITIALS = "H";

/**
 * The one or two letters on the household button: the first letter of the
 * first two words of the household's name, uppercased ("Shared home" → "SH",
 * "jane" → "J"). Pure, so the edge cases (blank, punctuation, emoji-leading
 * names) are testable without rendering anything.
 */
export function householdInitials(name: string | null | undefined): string {
  const words = (name ?? "").split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ""))[0] ?? "")
    .join("");
  return letters === "" ? FALLBACK_INITIALS : letters.toLocaleUpperCase();
}
