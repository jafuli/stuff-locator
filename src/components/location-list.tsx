import Link from "next/link";
import type { Location } from "@/lib/fixtures/types";

export interface LocationListProps {
  locations: readonly Location[];
}

/**
 * A navigable list of locations (root rooms on /browse, or a location's
 * direct children on /browse/[id]), each linking to /browse/[id]. Real
 * <ul>/<li> — unlike ItemCard's flattened-siblings row list, there's no
 * last:border-b-0 sibling-selector constraint here to worry about, so a
 * proper list is both more semantically correct and simpler.
 */
export function LocationList({ locations }: LocationListProps) {
  if (locations.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col">
      {locations.map((location) => (
        <li key={location.id} className="border-b border-[#ececec] last:border-b-0">
          <Link
            href={`/browse/${location.id}`}
            className="block py-[9px] text-[13.5px] font-semibold text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {location.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
