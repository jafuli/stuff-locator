import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Looks up display names for a set of user ids, as a map from id to name.
 *
 * Exists because items.added_by / last_moved_by are uuid references into
 * auth.users, which PostgREST doesn't expose and which this app couldn't
 * read anyway (no service-role key — see src/server/db/server.ts). The
 * profiles table is the readable substitute; see its migration.
 *
 * Ids the caller isn't allowed to see are simply absent from the map
 * rather than throwing — RLS restricts profiles to people you share a
 * household with, so "no row" is a normal outcome, not an error. Callers
 * resolve the gap through displayNameFor().
 */
export async function fetchDisplayNames(
  supabase: SupabaseClient<Database>,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(data.map((row) => [row.user_id, row.display_name]));
}
