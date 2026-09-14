import { StashForm } from "@/components/stash-form";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";

// Stash — record an item, its room/container, and a free-text "where
// exactly". Fixture-only: no Supabase call anywhere in this route or
// StashForm, and a successful "add" does not write into ITEMS
// (src/lib/fixtures/items.ts) — it will not appear on Home, Browse, or in
// Find results. That's a deliberate scope boundary for this task (see the PR
// description), not a bug. This route is a static sibling of the dynamic
// /items/[id] segment — Next.js resolves the literal "new" segment first, so
// there's no collision with an item actually named "new".
export default function Page() {
  const locationOptions = getFullLocationPaths(LOCATIONS);

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Add an item</h1>
      <StashForm locationOptions={locationOptions} locations={LOCATIONS} />
    </main>
  );
}
