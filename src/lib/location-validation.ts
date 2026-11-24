// Pure client-side validation for the place-name fields in Browse
// ("+ Add a place here" and Rename) — no React, no writes. Mirrors
// stash-validation.ts's shape: small functions that return
// `string | undefined`.

import { PLACE_NAME_SEPARATOR_MESSAGE, PATH_SEPARATOR } from "@/lib/limit-errors";

export function validatePlaceName(name: string): string | undefined {
  if (name.trim() === "") {
    return "Enter a name for this place.";
  }
  if (name.includes(PATH_SEPARATOR)) {
    return PLACE_NAME_SEPARATOR_MESSAGE;
  }
  return undefined;
}
