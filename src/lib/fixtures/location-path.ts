// In-memory ancestor-walk helpers over the Location shape (see types.ts) —
// originally written for fixture data, now also used by Home
// (src/app/page.tsx) to build breadcrumbs from real rows mapped into that
// same shape. A real "everything under X" walk (e.g. Browse's subtree
// listing) is a recursive CTE server-side instead (CLAUDE.md,
// location_subtree_items) — this is the client-side, whole-tree-already-
// in-memory equivalent, appropriate here because Home already has every
// one of the household's ~20-50 locations loaded, not just one subtree.
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
export function getBreadcrumbSegments(locationId: string, locations: readonly Location[]): LocationBreadcrumbSegment[] {
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
