// Pure client-side validation for the Stash (/items/new) and Edit-item forms —
// no React, no writes. Mirrors auth-validation.ts's shape: small functions
// that return `string | undefined`, run before the form ever "succeeds", so
// the success state can't be reached with an empty name or no place.

import type { PathChip } from "@/lib/location-path-picker";

export function validateItemName(name: string): string | undefined {
  if (name.trim() === "") {
    return "Enter a name for this item.";
  }
  return undefined;
}

/**
 * A place is required: the picker must hold at least one chip, and nothing
 * may be left typed-but-unresolved in its field. Text that never became a
 * chip is not a place — silently ignoring it would put the item somewhere
 * other than what the person typed. One message for both, so the person has
 * one thing to fix: choose a place.
 */
export function validateLocationPath(chips: readonly PathChip[], pendingText: string): string | undefined {
  if (chips.length === 0 || pendingText.trim() !== "") {
    return "Choose a location for this item.";
  }
  return undefined;
}
