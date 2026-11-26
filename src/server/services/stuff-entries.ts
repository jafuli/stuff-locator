import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StuffListEntry } from "@/components/stuff-list";
import type { Database } from "@/lib/database.types";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";

export interface StuffEntries {
  /** Every item, newest first, with its full breadcrumb. */
  entries: StuffListEntry[];
  /** Every place in the household. */
  locations: Location[];
}

/**
 * The household's whole item list, resolved for display and search: what the
 * Stuff screen lists, and what Browse searches while a query is typed. Plain
 * PostgREST reads, RLS-scoped to the caller's household.
 */
export async function loadStuffEntries(supabase: SupabaseClient<Database>, householdId: string): Promise<StuffEntries> {
  const [itemsResult, locationsResult] = await Promise.all([
    // Most-recently-added first — without an explicit order, Postgres row
    // order isn't guaranteed to stay stable across requests (e.g. after an
    // UPDATE from move_item), so the list could otherwise visibly reshuffle
    // on an unrelated reload.
    supabase.from("items").select("*").eq("household_id", householdId).order("added_at", { ascending: false }),
    supabase.from("locations").select("id, parent_id, name").eq("household_id", householdId),
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

  // Mapped into the Item shape src/lib/fixtures/types.ts defines, which
  // StuffList / ItemCard and the search ranking all work on.
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

  return { entries, locations };
}
