import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemCard } from "@/components/item-card";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { LocationList } from "@/components/location-list";
import { EmptyState } from "@/components/ui/empty-state";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getLocationContents } from "@/lib/fixtures/location-contents";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";

// Browse, core flow #3: a single location's contents — its direct child
// locations plus the items stored directly in it (not descendants' items).
// Same fixture-read shape as /items/[id]: find, notFound() for an unknown
// id (renders this segment's own not-found.tsx), then render.
export default async function Page(props: PageProps<"/browse/[id]">) {
  const { id } = await props.params;
  const location = LOCATIONS.find((candidate) => candidate.id === id);

  if (!location) {
    notFound();
  }

  const segments = getBreadcrumbSegments(location.id, LOCATIONS);
  const { childLocations, items } = getLocationContents(location.id, LOCATIONS, ITEMS);
  const isEmpty = childLocations.length === 0 && items.length === 0;

  // Not StuffList: its empty branch fires whenever there are zero items,
  // even when this location still has child locations to show (e.g. a
  // closet with a toolbox in it but nothing stashed directly in the
  // closet) — the wrong copy for that case (AC #3). This route owns its
  // own compound "nothing at all here" check instead.
  const parentLocation = location.parentId
    ? LOCATIONS.find((candidate) => candidate.id === location.parentId)
    : null;
  const upHref = parentLocation ? `/browse/${parentLocation.id}` : "/browse";
  const upLabel = parentLocation ? `‹ Back to ${parentLocation.name}` : "‹ Back to Browse";

  return (
    <main className="flex flex-col gap-3 p-4">
      {/* A real <Link>, so this is keyboard-operable (Tab + Enter) in
          addition to browser back — AC #5. */}
      <Link
        href={upHref}
        className="w-fit text-[11.5px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {upLabel}
      </Link>

      <div>
        <h1 className="text-[16px] font-semibold text-ink">{location.name}</h1>
        <LocationBreadcrumb segments={segments} />
      </div>

      {isEmpty ? (
        <EmptyState title="Nothing stored here yet" description="No items or sub-locations here." />
      ) : (
        <>
          {childLocations.length > 0 ? <LocationList locations={childLocations} /> : null}
          {items.length > 0 ? (
            <div>
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  segments={getBreadcrumbSegments(item.locationId, LOCATIONS)}
                  href={`/items/${item.id}`}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
