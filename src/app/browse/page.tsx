import Link from "next/link";
import { LocationList } from "@/components/location-list";
import { EmptyState } from "@/components/ui/empty-state";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getRootLocations } from "@/lib/fixtures/location-contents";

// Browse, core flow #3: the room-level entry point. Top-level locations
// (parentId === null) only — drilling into a room's own contents happens on
// /browse/[id]. The zero-roots branch is unreachable with the current
// fixtures (there are always 4 rooms) but kept for the DoD's "empty state
// handled explicitly" — same posture as StuffList's own empty branch.
//
// The "+ Add location" control (Add-location flow, /locations/new) is new
// here — no entry point into it existed anywhere in the app before this
// task, mirroring the same check the Stash flow task's own AC required for
// its own "+ Add item" control on Home (see that page.tsx's comment).
export default function Page() {
  const roots = getRootLocations(LOCATIONS);

  return (
    <main className="flex flex-col gap-3 p-4">
      <Link
        href="/"
        className="w-fit text-[11.5px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ‹ Back to Stuff
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[16px] font-semibold text-ink">Browse</h1>
        <Link
          href="/locations/new"
          className="inline-flex items-center justify-center rounded-[8px] bg-ink px-[10px] py-[7px] text-[12px] font-semibold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          + Add location
        </Link>
      </div>

      {roots.length === 0 ? (
        <EmptyState title="No rooms yet" description="Add a room to start organizing your stuff." />
      ) : (
        <LocationList locations={roots} />
      )}
    </main>
  );
}
