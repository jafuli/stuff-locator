/** Joins conditional class names, skipping falsy values. No dependency. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter((value): value is string => Boolean(value)).join(" ");
}
