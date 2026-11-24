import type { SupabaseClient } from "@supabase/supabase-js";
import { toActivityEntry, type ActivityEntry } from "@/lib/activity";
import type { Database } from "@/lib/database.types";
import { displayNameFor } from "@/lib/display-name";
import { fetchDisplayNames } from "@/lib/display-names-query";

/** How many events one page of the feed holds: the first render, then each "Show earlier activity". */
export const ACTIVITY_PAGE_SIZE = 50;

/**
 * Where the next (older) page starts: the last row shown. Keyset, not
 * offset, so events written while someone pages back never shift a page
 * and show an entry twice. `createdAt` is the row's own timestamp string,
 * with its microseconds: a Date would round them away and skip or repeat
 * rows that share a millisecond.
 */
export interface ActivityCursor {
  createdAt: string;
  id: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Null when this page reached the oldest event the household keeps. */
  next: ActivityCursor | null;
}

const COLUMNS =
  "id, household_id, actor_id, kind, subject_id, subject_name, from_text, to_text, detail_text, created_at";

/**
 * One page of a household's activity, newest first, from `before` (or the
 * newest event). Reads only `activity_events` (ADR 0011), RLS-scoped through
 * whichever client it is handed: the server's for the first page, the
 * browser's for "Show earlier activity" (reads go direct to PostgREST).
 *
 * Fetches one row more than a page to know whether an older page exists,
 * without a count query.
 */
export async function fetchActivityPage(
  supabase: SupabaseClient<Database>,
  householdId: string,
  before: ActivityCursor | null,
  pageSize = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  let query = supabase.from("activity_events").select(COLUMNS).eq("household_id", householdId);
  if (before !== null) {
    // Older than the cursor: an earlier timestamp, or the same one and a
    // smaller id (the same tie-break the order below uses). Quoted, because
    // a timestamp holds ":" and "+".
    query = query.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`);
  }
  const { data: rows, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (error) {
    throw new Error(error.message);
  }

  const pageRows = rows.slice(0, pageSize);
  const last = pageRows.at(-1);
  const displayNames = await fetchDisplayNames(
    supabase,
    pageRows.map((row) => row.actor_id),
  );

  return {
    entries: pageRows.flatMap((row) => {
      const entry = toActivityEntry(row, displayNameFor(row.actor_id, displayNames));
      return entry ? [entry] : [];
    }),
    next: rows.length > pageSize && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}
