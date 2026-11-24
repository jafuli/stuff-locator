import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { firstNameOf } from "@/lib/display-name";
import { clampToLength, LIMIT_ERROR_CODES, TEXT_LIMITS } from "@/lib/limits";

// Used when there is no usable name to derive one from (shouldn't happen in
// practice — every profile has a non-empty display name — but
// create_household rejects null/empty/whitespace-only names, so this is
// the guaranteed-non-empty fallback).
export const DEFAULT_HOUSEHOLD_NAME = "Our household";

/**
 * A new household's name, from the founder's display name: "Itamar's
 * household" (first name only, the brand voice). The display name is what
 * they typed at sign-up, or their email handle if they predate that field
 * (handle_new_user). Falls back to DEFAULT_HOUSEHOLD_NAME for a blank name.
 *
 * Clamped to the household-name limit (ADR 0015), so a 50-character first
 * name can't fail households' length CHECK and with it the whole bootstrap.
 */
export function deriveHouseholdName(displayName: string | null | undefined): string {
  const firstName = firstNameOf(displayName);
  return firstName === undefined
    ? DEFAULT_HOUSEHOLD_NAME
    : clampToLength(`${firstName}'s household`, TEXT_LIMITS.householdName);
}

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

  // The auth.users trigger has already seeded this (from the sign-up name,
  // or the email handle). An unreadable profile still gets a household,
  // under the default name.
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();

  const { error: createError } = await supabase.rpc("create_household", {
    p_name: deriveHouseholdName(profile?.display_name),
  });
  if (createError?.code === LIMIT_ERROR_CODES.alreadyInHousehold) {
    return { ok: true, created: false };
  }
  if (createError) {
    return { ok: false, error: createError.message };
  }
  return { ok: true, created: true };
}
