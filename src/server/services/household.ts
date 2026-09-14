import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Used when a user's email has no usable local-part to derive a name from
// (shouldn't happen in practice — Supabase Auth requires an email — but
// create_household rejects null/empty/whitespace-only names, so this is
// the guaranteed-non-empty fallback).
export const DEFAULT_HOUSEHOLD_NAME = "Our household";

/**
 * A deterministic, non-empty default household name derived from the
 * user's email local-part (the bit before "@"), e.g. "jane@example.com" ->
 * "jane". Falls back to DEFAULT_HOUSEHOLD_NAME if the local-part is empty
 * or whitespace-only once trimmed.
 */
export function deriveHouseholdName(email: string | null | undefined): string {
  const localPart = email?.split("@")[0]?.trim() ?? "";
  return localPart.length > 0 ? localPart : DEFAULT_HOUSEHOLD_NAME;
}

export type EnsureHouseholdResult =
  | { readonly ok: true; readonly created: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * Makes sure `userId` belongs to at least one household, creating one via
 * the create_household RPC if they don't already.
 *
 * create_household is intentionally NOT idempotent (see its migration) —
 * calling it twice as the same user creates two independent households.
 * The membership read below is the only thing preventing that on a repeat
 * call, so this function's whole job is "read, then conditionally write."
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
 * Known accepted limitation: the read and the write are two separate
 * PostgREST requests (each its own transaction), not one atomic operation.
 * Two concurrent calls for the same brand-new user (e.g. two tabs
 * finishing sign-in near-simultaneously) can each observe zero households
 * and each create one, producing two. No schema/RPC change is in scope
 * here to close that gap — see the PR description.
 */
export async function ensureHousehold(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | null | undefined,
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

  const { error: createError } = await supabase.rpc("create_household", {
    p_name: deriveHouseholdName(email),
  });
  if (createError) {
    return { ok: false, error: createError.message };
  }
  return { ok: true, created: true };
}
