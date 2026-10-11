import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityFeedEntry } from "@/components/activity-feed";
import type { Database } from "@/lib/database.types";
import { displayNameFor } from "@/lib/display-name";
import { getActivityEvents } from "@/lib/fixtures/activity";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import { fetchDisplayNames } from "./profiles";

/**
 * Builds the /activity feed for the household the caller belongs to.
 *
 * There is no audit table: the feed is derived from the provenance columns
 * items already carry (added_by / added_at / last_moved_by / last_moved_at),
 * so it shows each item's creation and its *most recent* move, not a full
 * history. That is deliberate for v1 — see ADR 0009.
 *
 * Takes its client as a parameter (like ensureHousehold) so it is testable
 * with a hand-built fake. Everything is RLS-scoped through the caller's JWT.
 *
 * Picks the oldest membership, the same rule Home uses, so the feed always
 * describes the household the person is looking at on Home.
 */
export async function fetchActivityEntries(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ActivityFeedEntry[]> {
  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error("activity: signed-in user has no household");
  }

  const [itemsResult, locationsResult] = await Promise.all([
    supabase
      .from("items")
      .select("id, location_id, name, added_by, added_at, last_moved_by, last_moved_at")
      .eq("household_id", membership.household_id),
    supabase.from("locations").select("id, parent_id, name").eq("household_id", membership.household_id),
  ]);

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }
  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  const displayNames = await fetchDisplayNames(
    supabase,
    itemsResult.data.flatMap((row) => [row.added_by, row.last_moved_by]),
  );

  const locations: Location[] = locationsResult.data.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));

  // The actor is stored as a display name, never the raw uuid — an id on
  // screen is a bug (see display-name.ts).
  const items: Item[] = itemsResult.data.map((row) => ({
    id: row.id,
    locationId: row.location_id,
    name: row.name,
    addedBy: displayNameFor(row.added_by, displayNames),
    addedAt: new Date(row.added_at),
    lastMovedBy: row.last_moved_by ? displayNameFor(row.last_moved_by, displayNames) : undefined,
    lastMovedAt: row.last_moved_at ? new Date(row.last_moved_at) : undefined,
  }));

  return getActivityEvents(items).map((event) => ({
    event,
    segments: getBreadcrumbSegments(event.item.locationId, locations),
  }));
}
