import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ItemDetail } from "@/components/item-detail";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/server";

// A malformed id (not a valid uuid at all — e.g. an old fixture slug, or a
// typo) fails at the Postgres driver level before RLS/row-matching even
// runs. That's a not-found, not a server error — folded into the same
// "no matching row" branch below rather than thrown into error.tsx. Same
// approach browse/[id]/page.tsx's own real-data read already established.
const INVALID_UUID_ERROR_CODE = "22P02";

// Item detail: real Supabase read now (see the PR description) — resolves
// the household server-side (same pattern as items/new/page.tsx), then a
// direct, RLS-protected read of the one item row by id. `notFound()` for a
// nonexistent or not-visible-under-RLS id renders this segment's own
// not-found.tsx (PR #10's pattern), same as the fixture version did.
//
// The "Edit" link is unchanged — already wired from the fixture-only task.
export default async function Page(props: PageProps<"/items/[id]">) {
  const { id } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error("items/[id]: signed-in user has no household");
  }

  const { data: itemRow, error: itemError } = await supabase
    .from("items")
    .select("*")
    .eq("household_id", membership.household_id)
    .eq("id", id)
    .maybeSingle();

  if (itemError && itemError.code !== INVALID_UUID_ERROR_CODE) {
    throw new Error(itemError.message);
  }
  if (!itemRow) {
    notFound();
  }

  const { data: locationRows, error: locationsError } = await supabase
    .from("locations")
    .select("id, parent_id, name")
    .eq("household_id", membership.household_id);

  if (locationsError) {
    throw new Error(locationsError.message);
  }

  const locations: Location[] = locationRows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));

  // Mapped into the same Item shape src/lib/fixtures/types.ts already
  // defines, same as Home/Stash — ItemDetail doesn't care whether it came
  // from a fixture or a real row. addedBy/lastMovedBy are raw user ids
  // here: there's no profile/display-name resolution anywhere in this app
  // yet (Activity is still fixture-only for the same reason) — out of
  // scope for this task, flagged in the PR rather than guessed at.
  const item: Item = {
    id: itemRow.id,
    locationId: itemRow.location_id,
    name: itemRow.name,
    detail: itemRow.detail ?? undefined,
    addedBy: itemRow.added_by,
    addedAt: new Date(itemRow.added_at),
    lastMovedBy: itemRow.last_moved_by ?? undefined,
    lastMovedAt: itemRow.last_moved_at ? new Date(itemRow.last_moved_at) : undefined,
  };
  const segments = getBreadcrumbSegments(item.locationId, locations);

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
