import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ItemCard } from "@/components/item-card";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { LocationList } from "@/components/location-list";
import { EmptyState } from "@/components/ui/empty-state";
import type { LocationBreadcrumbSegment } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/server/db/server";

// A malformed id (not a valid uuid at all — e.g. an old fixture slug, or a
// typo) fails at the Postgres driver level before RLS/row-matching even
// runs. That's a not-found, not a server error — folded into the same
// "no matching row" branch below rather than thrown into error.tsx.
const INVALID_UUID_ERROR_CODE = "22P02";

interface LocationRow {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Fetches one location row by id, memoized in `cache` for the lifetime of
 * this request — a single location commonly comes up more than once
 * (multiple items sharing a container, or an ancestor shared by several
 * items' breadcrumb walks below), and this keeps each row fetched at most
 * once.
 */
async function resolveLocationRow(
  supabase: SupabaseClient<Database>,
  householdId: string,
  id: string,
  cache: Map<string, LocationRow>,
): Promise<LocationRow | null> {
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  const { data, error } = await supabase
    .from("locations")
    .select("id, parent_id, name")
    .eq("household_id", householdId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (error.code === INVALID_UUID_ERROR_CODE) {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const row: LocationRow = { id: data.id, name: data.name, parentId: data.parent_id };
  cache.set(id, row);
  return row;
}

/**
 * Walks a location's ancestor chain up to the root via repeated single-row
 * reads (parent_id is null at the top) — the real-data equivalent of
 * src/lib/fixtures/location-path.ts's getBreadcrumbSegments, which needs
 * the *whole* location tree already in memory (fine for Home, which loads
 * all of it anyway; wrong for Browse, which only ever needs one subtree —
 * see that file's own comment on this exact split). Root-first, ending
 * with `locationId` itself. Cycle-guarded defensively, same as the fixture
 * version, even though a real cycle should be unreachable (move_container's
 * own migration enforces this under lock).
 */
async function resolveBreadcrumbSegments(
  supabase: SupabaseClient<Database>,
  householdId: string,
  locationId: string,
  cache: Map<string, LocationRow>,
): Promise<LocationBreadcrumbSegment[]> {
  const segments: LocationBreadcrumbSegment[] = [];
  const visited = new Set<string>();
  let currentId: string | null = locationId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const row = await resolveLocationRow(supabase, householdId, currentId, cache);
    if (!row) {
      break;
    }
    segments.unshift({ id: row.id, name: row.name });
    currentId = row.parentId;
  }

  return segments;
}

// Browse, core flow #3: a single location's contents. Real Supabase reads
// now (see the PR description): the current location, its immediate child
// locations (a direct, targeted read), and every item nested anywhere in
// its subtree (the location_subtree_items RPC — a recursive CTE
// server-side, not a client-side tree walk). This is a semantic change
// from the old fixture behavior (getItemsInLocation only returned items
// stored *directly* in the location, not descendants') — intentional, per
// this task's AC #1.
//
// "Add location"/"Add item" wiring beyond what those separate tasks
// already do is explicitly out of scope here (AC #5) — this route is
// read-only.
export default async function Page(props: PageProps<"/browse/[id]">) {
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
    throw new Error("browse/[id]: signed-in user has no household");
  }

  const cache = new Map<string, LocationRow>();
  const currentRow = await resolveLocationRow(supabase, membership.household_id, id, cache);

  if (!currentRow) {
    notFound();
  }

  const [childLocationsResult, subtreeItemsResult] = await Promise.all([
    supabase
      .from("locations")
      .select("id, parent_id, name")
      .eq("household_id", membership.household_id)
      .eq("parent_id", currentRow.id),
    supabase.rpc("location_subtree_items", { p_location_id: currentRow.id }),
  ]);

  if (childLocationsResult.error) {
    throw new Error(childLocationsResult.error.message);
  }
  if (subtreeItemsResult.error) {
    throw new Error(subtreeItemsResult.error.message);
  }

  const childLocations: Location[] = childLocationsResult.data.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));
  // Seed the cache with the children we already have in hand — several
  // subtree items commonly live directly in one of them, which then needs
  // no further fetch for its own breadcrumb walk below.
  for (const row of childLocationsResult.data) {
    cache.set(row.id, { id: row.id, name: row.name, parentId: row.parent_id });
  }

  const items: Item[] = subtreeItemsResult.data.map((row) => ({
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    detail: row.detail ?? undefined,
    addedBy: row.added_by,
    addedAt: new Date(row.added_at),
    lastMovedBy: row.last_moved_by ?? undefined,
    lastMovedAt: row.last_moved_at ? new Date(row.last_moved_at) : undefined,
  }));

  const segments = await resolveBreadcrumbSegments(supabase, membership.household_id, currentRow.id, cache);
  const isEmpty = childLocations.length === 0 && items.length === 0;

  // The breadcrumb walk above already visited every ancestor, including the
  // immediate parent — reusing its result here avoids a second fetch for
  // the exact same row.
  const parentSegment = segments.length > 1 ? segments[segments.length - 2] : null;
  const upHref = parentSegment ? `/browse/${parentSegment.id}` : "/browse";
  const upLabel = parentSegment ? `‹ Back to ${parentSegment.name}` : "‹ Back to Browse";

  // One breadcrumb walk per *distinct* item location, not per item — a
  // household this small (~20-50 locations/items, per CLAUDE.md) makes the
  // sequential awaits here a non-issue; running them in parallel instead
  // would risk two calls racing to fetch (and cache) the same shared
  // ancestor.
  const itemSegments = new Map<string, LocationBreadcrumbSegment[]>();
  for (const item of items) {
    if (!itemSegments.has(item.locationId)) {
      itemSegments.set(
        item.locationId,
        await resolveBreadcrumbSegments(supabase, membership.household_id, item.locationId, cache),
      );
    }
  }

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
        <h1 className="text-[16px] font-semibold text-ink">{currentRow.name}</h1>
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
                  segments={itemSegments.get(item.locationId) ?? []}
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
