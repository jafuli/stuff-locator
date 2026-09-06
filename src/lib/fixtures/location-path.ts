// MOCK DATA helpers — see types.ts. Real "everything under X" / ancestor
// walks are a recursive CTE server-side (CLAUDE.md); this is the equivalent
// in-memory walk over fixture data, used only to feed the demo components.
import type { Location } from "./types";

/** A single crumb in a resolved root→leaf location path. */
export interface LocationBreadcrumbSegment {
  id: string;
  name: string;
}

/**
 * Walks a location's ancestor chain (root first) and returns each segment's
 * id alongside its name, e.g. [{id: "garage", name: "Garage"}, ...,
 * {id: "garage-closet-toolbox-red-box", name: "Red box"}]. Guards against
 * cycles defensively — fixture data has none, but this mirrors the care the
 * real recursive-CTE version needs to take.
 */
export function getBreadcrumbSegments(
  locationId: string,
  locations: readonly Location[],
): LocationBreadcrumbSegment[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const segments: LocationBreadcrumbSegment[] = [];
  const visited = new Set<string>();

  let current = byId.get(locationId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return segments;
}

/**
 * Plain-name version of getBreadcrumbSegments, e.g. ["Garage", "Closet",
 * "Toolbox", "Red box"] — kept for getFullLocationPaths below, which only
 * ever needs the flattened string form.
 */
export function getBreadcrumbNames(locationId: string, locations: readonly Location[]): string[] {
  return getBreadcrumbSegments(locationId, locations).map((segment) => segment.name);
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
