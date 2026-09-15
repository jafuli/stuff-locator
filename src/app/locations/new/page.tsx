import { AddLocationForm } from "@/components/add-location-form";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";

// Add-location — closes the gap the Stash flow's own AC explicitly left
// open: /items/new only lets you pick an EXISTING fixture location, with
// no way to create a brand-new one inline. Fixture-only: no Supabase call
// anywhere in this route or AddLocationForm, and a successful "add" does
// not write into LOCATIONS (src/lib/fixtures/locations.ts) — the new
// location will not appear on Browse, Home, or in the Stash/edit-item
// location-autocomplete. That's a deliberate scope boundary for this task
// (see the PR description), not a bug.
export default function Page() {
  const locationOptions = getFullLocationPaths(LOCATIONS);

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Add a location</h1>
      <AddLocationForm locationOptions={locationOptions} locations={LOCATIONS} />
    </main>
  );
}
