import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} — this spec needs a real local Supabase stack. Run ` +
        "`npm run supabase:start`, then either export SUPABASE_URL/SUPABASE_ANON_KEY/" +
        "SUPABASE_SERVICE_ROLE_KEY yourself or write them to a gitignored " +
        ".env.rls.local (from `npx supabase status -o env`) — `npm run test:e2e` " +
        "auto-loads that file the same way `npm run test:rls` does.",
    );
  }
  return value;
}

async function signInForHouseholdId(email: string, password: string): Promise<{ userId: string; householdId: string }> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const anonClient = createClient<Database>(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`failed to sign in as ${email}: ${error.message}`);
  }

  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("household_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`failed to resolve a household for ${email}: ${membershipError.message}`);
  }
  if (!membership) {
    throw new Error(`no household found for ${email}`);
  }

  return { userId: data.user.id, householdId: membership.household_id };
}

async function insertOneLocation(
  serviceClient: SupabaseClient<Database>,
  householdId: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const { data, error } = await serviceClient
    .from("locations")
    .insert({ household_id: householdId, name, parent_id: parentId })
    .select("id")
    .single();
  if (error) {
    throw new Error(`failed to seed location "${name}": ${error.message}`);
  }
  return data.id;
}

/**
 * Seeds a nested chain of locations (e.g. ["Bedroom", "Filing box"] ->
 * Bedroom > Filing box) into `email`'s household via the service-role
 * client (bypasses RLS for setup, same convention as seedHouseholdWithOwner
 * in supabase/tests/). Returns the leaf location's real id. Used by specs
 * whose pages now read real household data instead of the LOCATIONS
 * fixture (home.spec.ts, home-search.spec.ts, browse.spec.ts, stash.spec.ts).
 */
export async function seedLocationChain(email: string, password: string, names: readonly string[]): Promise<string> {
  const ids = await seedLocationChainAllIds(email, password, names);
  return ids[ids.length - 1];
}

/**
 * Same seeding as seedLocationChain, but returns every id in the chain
 * (root first) instead of just the leaf — used where a test needs an
 * ANCESTOR's id specifically (e.g. Browse's own page for a location with a
 * nested child, not the child itself).
 */
export async function seedLocationChainAllIds(
  email: string,
  password: string,
  names: readonly string[],
): Promise<string[]> {
  const { householdId } = await signInForHouseholdId(email, password);
  const serviceClient = createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const ids: string[] = [];
  let parentId: string | null = null;
  for (const name of names) {
    parentId = await insertOneLocation(serviceClient, householdId, name, parentId);
    ids.push(parentId);
  }
  if (ids.length === 0) {
    throw new Error("seedLocationChainAllIds: names must be non-empty");
  }
  return ids;
}

/**
 * Seeds one real item into `email`'s household at `locationId` (from
 * seedLocationChain) via the service-role client. Returns the item's real
 * id.
 */
export async function seedItem(
  email: string,
  password: string,
  params: { name: string; locationId: string; detail?: string },
): Promise<string> {
  const { userId, householdId } = await signInForHouseholdId(email, password);
  const serviceClient = createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data, error } = await serviceClient
    .from("items")
    .insert({
      household_id: householdId,
      location_id: params.locationId,
      name: params.name,
      detail: params.detail,
      added_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`failed to seed item "${params.name}": ${error.message}`);
  }
  return data.id;
}

/**
 * Reads a real item row back by name via the service-role client — proof
 * that stash-form.tsx's submit produced an actual persisted row, not just a
 * UI echo. Names used in these tests are unique per test run, so a plain
 * name match is unambiguous.
 */
export async function findItemByName(name: string): Promise<{ id: string; household_id: string } | null> {
  const serviceClient = createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const { data, error } = await serviceClient.from("items").select("id, household_id").eq("name", name).maybeSingle();
  if (error) {
    throw new Error(`failed to query item "${name}" back: ${error.message}`);
  }
  return data;
}

/**
 * Signs in as the given user from Node (not the browser under test) and
 * counts their household_members rows — used to prove household-bootstrap
 * doesn't create duplicate households, without depending on any UI
 * surfacing that count (the app's real pages are still fixture-backed).
 * Mirrors the signInAs pattern already established in supabase/tests/.
 */
export async function countHouseholdsForUser(email: string, password: string): Promise<number> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const anonClient = createClient<Database>(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`failed to sign in as ${email} for a household-count check: ${error.message}`);
  }

  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  const { data: memberships, error: membershipError } = await userClient
    .from("household_members")
    .select("household_id")
    .eq("user_id", data.user.id);
  if (membershipError) {
    throw new Error(`failed to read household_members for ${email}: ${membershipError.message}`);
  }
  return memberships.length;
}
