import Link from "next/link";
import { redirect } from "next/navigation";
import { GuidedOnboarding } from "@/components/guided-onboarding";
import type { StuffListEntry } from "@/components/stuff-list";
import { SearchableStuffList } from "@/components/searchable-stuff-list";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import { firstNameOf } from "@/lib/display-name";
import { STUFF_HEADING } from "@/lib/stuff-heading";
import { buttonClassName } from "@/components/ui/button";
import { createClient } from "@/server/db/server";
import { fetchDisplayNames } from "@/server/services/profiles";

// The Stash entry point is a link (it navigates) wearing the system's primary
// button look: ink fill, paper text.
const STASH_LINK_CLASSES = buttonClassName("primary", "shrink-0");

// Wireframe screen 02, "Home — everything (default)": search box, the
// "All (n)" / "By place" chips (the way into Browse; v1's "Recent" chip is
// deliberately not added) and the full item list, each row showing its full
// location path.
//
// Real household data now (see the PR description): items/locations are
// read directly via PostgREST, RLS-scoped to the caller's household — no
// route handler for this plain read, per the settled architecture.
export default async function Page(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  // A search typed on Browse arrives as ?q=; only a plain string is used.
  const rawQuery = searchParams.q;
  const initialQuery = typeof rawQuery === "string" ? rawQuery : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // create_household's own migration notes multi-household membership is
  // intentionally unrestricted (composite PK, not unique on user_id) — a
  // caller could belong to more than one. Without an explicit order, which
  // one comes back first is undefined and can vary between requests; this
  // orders by joined_at so the choice is at least deterministic (oldest
  // membership first) rather than arbitrary. Not a full multi-household
  // answer (there's no UI anywhere for a member to choose or switch
  // households), same known limitation as ensureHousehold's identical
  // unordered read in src/server/services/household.ts.
  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error("home: signed-in user has no household");
  }

  const [itemsResult, locationsResult, householdResult] = await Promise.all([
    // Most-recently-added first — without an explicit order, Postgres row
    // order isn't guaranteed to stay stable across requests (e.g. after an
    // UPDATE from move_item), so the list could otherwise visibly reshuffle
    // on an unrelated reload.
    supabase
      .from("items")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("added_at", { ascending: false }),
    supabase.from("locations").select("id, parent_id, name").eq("household_id", membership.household_id),
    // Whether Guided onboarding has already run its course for this
    // household — see guided-onboarding.tsx's own doc comment for why
    // "zero items" alone can't answer that on its own.
    supabase.from("households").select("onboarding_completed_at").eq("id", membership.household_id).single(),
  ]);

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }
  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }
  if (householdResult.error) {
    throw new Error(householdResult.error.message);
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

  // First names for the "Noa, 3 days ago" meta line, via the same profiles
  // service the item page and Activity use. An id RLS hides is simply absent,
  // and that row just shows the time.
  const displayNames = await fetchDisplayNames(
    supabase,
    items.map((item) => item.lastMovedBy ?? item.addedBy),
  );

  const entries: StuffListEntry[] = items.map((item) => {
    const toucherId = item.lastMovedBy ?? item.addedBy;
    const fullName = toucherId ? displayNames.get(toucherId) : undefined;
    return {
      item,
      segments: getBreadcrumbSegments(item.locationId, locations),
      byName: firstNameOf(fullName),
    };
  });

  // Guided onboarding replaces the plain empty state, not the whole page,
  // and only for a household that's both actually empty AND hasn't already
  // run the sequence to completion (see households.onboarding_completed_at
  // and guided-onboarding.tsx's own doc comment on why both checks matter).
  const showOnboarding = items.length === 0 && householdResult.data.onboarding_completed_at === null;

  return (
    <main className="flex flex-col gap-4 px-gutter pt-6">
      <h1 className="text-display text-ink">{STUFF_HEADING}</h1>

      {showOnboarding ? (
        <GuidedOnboarding householdId={membership.household_id} locations={locations} />
      ) : (
        /*
          SearchableStuffList owns the search input's state and filters
          `entries` client-side (src/lib/fixtures/search.ts) — a real,
          working filter now, not the earlier visual-only placeholder.
          Entries themselves are still resolved server-side here, not
          fetched by the client component. The Stash button is hidden while
          onboarding runs (above): it's a second, unguided way into the same
          flow, and a tap on it silently abandons the sequence.
          emptyStateAction only ever shows for the true "this household has
          zero items" case (StuffList's own empty state) — a "no search
          matches" query shows a different, unrelated empty state that isn't
          a candidate for this CTA.
        */
        <SearchableStuffList
          entries={entries}
          initialQuery={initialQuery}
          searchAction={
            <Link href="/items/new" className={STASH_LINK_CLASSES}>
              Stash
            </Link>
          }
          emptyStateAction={
            <Link href="/items/new" className={buttonClassName("primary")}>
              Stash your first item
            </Link>
          }
        />
      )}
    </main>
  );
}
