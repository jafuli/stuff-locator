import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemDetail } from "@/components/item-detail";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";

// Item detail: same fixture-read shape as the home route (src/app/page.tsx)
// — find the item, resolve its breadcrumb, render. `notFound()` for an
// unknown id renders this segment's own not-found.tsx (see that file).
//
// The "Edit" link is new here — no entry point into /items/[id]/edit
// existed anywhere in the app before this task, mirroring the same
// existing-control check the Stash and Add-location flow tasks' own AC
// required for their own entry points.
export default async function Page(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;
  const item = ITEMS.find((candidate) => candidate.id === id);

  if (!item) {
    notFound();
  }

  const segments = getBreadcrumbSegments(item.locationId, LOCATIONS);

  return (
    <main className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="w-fit text-[11.5px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          ‹ Back to Stuff
        </Link>
        <Link
          href={`/items/${id}/edit`}
          className="inline-flex items-center justify-center rounded-[8px] border-[1.5px] border-line bg-transparent px-[10px] py-[7px] text-[12px] font-semibold text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Edit
        </Link>
      </div>
      <ItemDetail item={item} segments={segments} />
    </main>
  );
}
