// Pure client-side validation for the Stash (/items/new) form — no React, no
// fixture writes. Mirrors auth-validation.ts's shape: small functions that
// return `string | undefined`, run before the form ever "succeeds", so the
// success state can't be reached with an empty name or an unresolved
// location.

import type { AutocompleteSelection } from "@/components/location-autocomplete";

export function validateItemName(name: string): string | undefined {
  if (name.trim() === "") {
    return "Enter a name for this item.";
  }
  return undefined;
}

/**
 * `null` covers both "never touched the field" and "typed something into
 * the combobox but never actually selected a row" — LocationAutocomplete
 * only tells its caller about explicit selections (see its own doc
 * comment), so an unselected typed value simply never reaches this form's
 * state at all and falls into the same `null` case.
 *
 * `{ type: "new" }` covers picking the combobox's "+ New place called…"
 * row — this task doesn't support creating a location inline, so that's
 * rejected with its own message rather than silently accepted.
 */
export function validateLocationSelection(selection: AutocompleteSelection | null): string | undefined {
  if (selection === null) {
    return "Choose a location for this item.";
  }
  if (selection.type === "new") {
    return "Pick an existing location from the list — adding a new one isn't supported here yet.";
  }
  return undefined;
}
