import Link from "next/link";
import { redirect } from "next/navigation";
import type { StuffListEntry } from "@/components/stuff-list";
import { SearchableStuffList } from "@/components/searchable-stuff-list";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/server";

const ADD_ITEM_LINK_CLASSES =
  "inline-flex items-center justify-center rounded-[8px] bg-ink px-[10px] py-[7px] text-[12px] font-semibold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

// Wireframe screen 02, "Home — everything (default)": search box + the full
// item list, each row showing its full location path. The "All/By place/
// Recent" toggle chips drawn on that screen are a separate flow (Browse) —
// out of scope here, not silently dropped.
//
// Real household data now (see the PR description): items/locations are
// read directly via PostgREST, RLS-scoped to the caller's household — no
// route handler for this plain read, per the settled architecture. Browse,
// item-detail, Activity, Stash's write path, Add-location, and Edit-item
// all stay on fixtures until their own separate wiring tasks land (this
// task's own AC names all of them explicitly as out of scope).
export default async function Page() {
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
    throw new Error("home: signed-in user has no household");
  }

  const [itemsResult, locationsResult] = await Promise.all([
    supabase.from("items").select("*").eq("household_id", membership.household_id),
    supabase.from("locations").select("id, parent_id, name").eq("household_id", membership.household_id),
  ]);

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }
  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  const locations: Location[] = locationsResult.data.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));

  // Mapped into the same Item shape src/lib/fixtures/types.ts already
  // defines — filterItems/StuffList/ItemCard all operate on that shape
  // structurally and don't care whether it came from a fixture array or a
  // real row, so none of them needed to change for this task (AC #3).
  const items: Item[] = itemsResult.data.map((row) => ({
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    detail: row.detail ?? undefined,
    addedBy: row.added_by,
    addedAt: new Date(row.added_at),
    lastMovedBy: row.last_moved_by ?? undefined,
    lastMovedAt: row.last_moved_at ? new Date(row.last_moved_at) : undefined,
  }));

  const entries: StuffListEntry[] = items.map((item) => ({
    item,
    segments: getBreadcrumbSegments(item.locationId, locations),
  }));

  return (
    <main className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[16px] font-semibold text-ink">Our stuff</h1>
        <Link href="/items/new" className={ADD_ITEM_LINK_CLASSES}>
          + Add item
        </Link>
      </div>

      {/*
        SearchableStuffList owns the search input's state and filters
        `entries` client-side (src/lib/fixtures/search.ts) — a real,
        working filter now, not the earlier visual-only placeholder.
        Entries themselves are still resolved server-side here, not
        fetched by the client component. emptyStateAction only ever shows
        for the true "this household has zero items" case (StuffList's own
        empty state) — a "no search matches" query shows a different,
        unrelated empty state that isn't a candidate for this CTA.
      */}
      <SearchableStuffList
        entries={entries}
        emptyStateAction={
          <Link href="/items/new" className={ADD_ITEM_LINK_CLASSES}>
            Stash your first item
          </Link>
        }
      />
    </main>
  );
}
