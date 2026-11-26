import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LIMIT_ERROR_CODES } from "@/lib/limits";

export type EnsureHouseholdResult =
  { readonly ok: true; readonly created: boolean } | { readonly ok: false; readonly error: string };

/**
 * Makes sure `userId` belongs to at least one household, creating one via
 * the create_household RPC if they don't already.
 *
 * create_household refuses a caller who already belongs to a household
 * (SL004, ADR 0015), but the membership read below still comes first so the
 * common repeat call costs one read and no failed write — this function's
 * job is "read, then conditionally write."
 * That's why it lives here rather than as a bare read in the route
 * handler: src/server/services/README.md scopes this layer to
 * "orchestration for anything that isn't a plain read," and a read used
 * only to decide whether to perform a write isn't a plain read.
 *
 * Takes an already-constructed client (dependency injection) rather than
 * building one itself, so this is directly callable from a unit test with
 * a hand-built fake `{ from, rpc }` client, or from an integration test
 * with a real signed-in/anon client — no module mocking needed either way.
 *
 * The read and the write are two separate PostgREST requests, so two
 * concurrent calls for the same brand-new user (e.g. two tabs finishing
 * sign-in near-simultaneously) can both observe zero households. Since
 * ADR 0015, create_household itself refuses a caller who already belongs
 * to a household (SL004, serialised per user), so the slower call loses
 * that race and is reported here as "already had one", not as an error.
 */
export async function ensureHousehold(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<EnsureHouseholdResult> {
  const { data: existing, error: readError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1);

  if (readError) {
    return { ok: false, error: readError.message };
  }
  if (existing.length > 0) {
    return { ok: true, created: false };
  }

  // No name: a household is unnamed until someone chooses one, and the app
  // titles it after its owner when it is shown (src/lib/household-title.ts).
  const { error: createError } = await supabase.rpc("create_household");
  if (createError?.code === LIMIT_ERROR_CODES.alreadyInHousehold) {
    return { ok: true, created: false };
  }
  if (createError) {
    return { ok: false, error: createError.message };
  }
  return { ok: true, created: true };
}
