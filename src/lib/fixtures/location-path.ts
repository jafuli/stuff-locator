// MOCK DATA helpers — see types.ts. Real "everything under X" / ancestor
// walks are a recursive CTE server-side (CLAUDE.md); this is the equivalent
// in-memory walk over fixture data, used only to feed the demo components.
import type { Location } from "./types";

/**
 * Walks a location's ancestor chain (root first) and returns the plain
 * names, e.g. ["Garage", "Closet", "Toolbox", "Red box"]. Guards against
 * cycles defensively — fixture data has none, but this mirrors the care the
 * real recursive-CTE version needs to take.
 */
export function getBreadcrumbNames(locationId: string, locations: readonly Location[]): string[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const names: string[] = [];
  const visited = new Set<string>();

  let current = byId.get(locationId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return names;
}

export interface LocationOption {
  id: string;
  path: string;
}

/**
 * Flattens every location into its full "Garage › Closet › Toolbox › Red
 * box" path string — the shape location-autocomplete's fixture data needs.
 */
export function getFullLocationPaths(locations: readonly Location[]): LocationOption[] {
  return locations.map((location) => ({
    id: location.id,
    path: getBreadcrumbNames(location.id, locations).join(" › "),
  }));
}
