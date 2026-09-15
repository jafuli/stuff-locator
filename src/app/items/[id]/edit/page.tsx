import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemEditForm } from "@/components/item-edit-form";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";

// Edit item — closes the last lifecycle gap: create (Stash), view
// (item-detail), browse, and find all exist, but nothing lets you fix a
// mistake after adding an item. Fixture-only: no Supabase call anywhere in
// this route or ItemEditForm, and neither a successful edit nor a delete
// writes into ITEMS (src/lib/fixtures/items.ts) — changes don't persist
// across a reload or appear on Home/Browse/Search. That's a deliberate
// scope boundary for this task (see the PR description), not a bug.
export default async function Page(props: PageProps<"/items/[id]/edit">) {
  const { id } = await props.params;
  const item = ITEMS.find((candidate) => candidate.id === id);

  if (!item) {
    notFound();
  }

  const locationOptions = getFullLocationPaths(LOCATIONS);

  return (
    <main className="flex flex-col gap-3 p-4">
      <Link
        href={`/items/${id}`}
        className="w-fit text-[11.5px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ‹ Back to item
      </Link>
      <h1 className="text-[16px] font-semibold text-ink">Edit item</h1>
      <ItemEditForm item={item} locationOptions={locationOptions} locations={LOCATIONS} />
    </main>
  );
}
