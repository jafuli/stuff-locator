// Pure client-side validation for the Add-location (/locations/new) form —
// no React, no fixture writes. Mirrors stash-validation.ts's shape: small
// functions that return `string | undefined`, run before the form ever
// "succeeds".

import type { AutocompleteSelection } from "@/components/location-autocomplete";

export function validateLocationName(name: string): string | undefined {
  if (name.trim() === "") {
    return "Enter a name for this location.";
  }
  return undefined;
}

/**
 * Unlike Stash's required location field, this one is optional: `null`
 * (never touched the field, or typed something into the combobox but never
 * actually selected a row — see LocationAutocomplete's own doc comment on
 * why those two collapse into the same `null`) is valid, not an error. A
 * location with no parent sits at the top level, matching the settled
 * locations.parent_id nullable self-reference model.
 *
 * Only picking the combobox's "+ New place called…" row is rejected — this
 * fixture-only flow can't nest a new location under another not-yet-
 * existing one.
 */
export function validateParentSelection(selection: AutocompleteSelection | null): string | undefined {
  if (selection === null) {
    return undefined;
  }
  if (selection.type === "new") {
    return "Pick an existing location from the list — adding a new one isn't supported here yet.";
  }
  return undefined;
}
