// Pure client-side validation for the Add-location (/locations/new) form —
// no React, no writes. Mirrors stash-validation.ts's shape.

export function validateLocationName(name: string): string | undefined {
  if (name.trim() === "") {
    return "Enter a name for this location.";
  }
  return undefined;
}
