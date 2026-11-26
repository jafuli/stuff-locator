import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActivityPage, type ActivityPage } from "@/lib/activity-page";
import type { Database } from "@/lib/database.types";

/** The household the feed is for, and its first page. */
export interface FirstActivityPage extends ActivityPage {
  householdId: string;
}

/**
 * The first page of the /activity feed for the household the caller belongs
 * to (ADR 0011: activity_events only). Older pages are fetched from the
 * browser with the same fetchActivityPage, starting from `next`.
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
): Promise<FirstActivityPage> {
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

  const page = await fetchActivityPage(supabase, membership.household_id, null);
  return { householdId: membership.household_id, ...page };
}
