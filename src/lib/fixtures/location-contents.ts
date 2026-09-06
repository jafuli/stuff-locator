// MOCK DATA helpers — see types.ts. The real "children of X" / "items
// directly in X" queries are a recursive CTE / simple filter server-side
// (CLAUDE.md); this is the in-memory equivalent over fixture data, feeding
// the Browse route (/browse, /browse/[id]).
import type { Item, Location } from "./types";

/** Top-level locations (parentId === null) — the /browse root list. */
export function getRootLocations(locations: readonly Location[]): Location[] {
  return locations.filter((location) => location.parentId === null);
}

/** Direct children of a location — locations whose parentId === locationId. Does not recurse. */
export function getChildLocations(locationId: string, locations: readonly Location[]): Location[] {
  return locations.filter((location) => location.parentId === locationId);
}

/** Items stored directly in a location — locationId === the given id. Does not include descendants' items. */
export function getItemsInLocation(locationId: string, items: readonly Item[]): Item[] {
  return items.filter((item) => item.locationId === locationId);
}

export interface LocationContents {
  childLocations: Location[];
  items: Item[];
}

/** Everything /browse/[id] needs to render for one location: its direct children and its direct items. */
export function getLocationContents(
  locationId: string,
  locations: readonly Location[],
  items: readonly Item[],
): LocationContents {
  return {
    childLocations: getChildLocations(locationId, locations),
    items: getItemsInLocation(locationId, items),
  };
}
