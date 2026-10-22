import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import type { Location } from "@/lib/fixtures/types";

export interface LocationListProps {
  locations: readonly Location[];
}

/**
 * A navigable list of places (root rooms on /browse, or a place's direct
 * children on /browse/[id]), each linking to /browse/[id]: a panel of 56px
 * rows with the place name in `title` type and a chevron saying "this goes
 * somewhere". Real <ul>/<li> — unlike ItemCard's flattened-siblings row
 * list, there's no last:border-b-0 sibling-selector constraint here to worry
 * about, so a proper list is both more semantically correct and simpler.
 */
export function LocationList({ locations }: LocationListProps) {
  if (locations.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col overflow-hidden rounded-panel border border-hairline bg-surface">
      {locations.map((location) => (
        <li key={location.id} className="border-b border-divider last:border-b-0">
          <Link
            href={`/browse/${location.id}`}
            className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-title text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            <span className="min-w-0 break-words">{location.name}</span>
            <ChevronRightIcon className="shrink-0 text-faint" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
