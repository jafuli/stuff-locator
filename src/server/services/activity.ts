import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toActivityEntry, type ActivityEntry } from "@/lib/activity";
import type { Database } from "@/lib/database.types";
import { displayNameFor } from "@/lib/display-name";
import { fetchDisplayNames } from "./profiles";

/** How many of the most recent events the feed shows. */
export const ACTIVITY_FEED_LIMIT = 100;

/**
 * Builds the /activity feed for the household the caller belongs to.
 *
 * Reads ONLY `activity_events` (ADR 0011): every change to an item or place
 * is recorded there by the function that made it, in the same transaction,
 * so there is nothing to derive or merge. Newest first, capped at
 * ACTIVITY_FEED_LIMIT.
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
): Promise<ActivityEntry[]> {
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

  const { data: rows, error } = await supabase
    .from("activity_events")
    .select("id, household_id, actor_id, kind, subject_id, subject_name, from_text, to_text, detail_text, created_at")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_FEED_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  const displayNames = await fetchDisplayNames(
    supabase,
    rows.map((row) => row.actor_id),
  );

  return rows.flatMap((row) => {
    const entry = toActivityEntry(row, displayNameFor(row.actor_id, displayNames));
    return entry ? [entry] : [];
  });
}
