// Integration test for the Stash flow's real write path (stash-form.tsx's
// direct `.from("items").insert(...)`) — NOT part of `npm run test` (see
// vitest.config.mts's exclude). Requires a running local Supabase stack
// with every migration through
// 20260915090000_items_location_household_trigger.sql applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// invites-rls.test.ts for the same shortcut) if you've written one;
// otherwise export them yourself before running this.
//
// Covers:
//   - a real insert lands with the correct household_id/added_by/location_id
//   - a location belonging to a different household is rejected with a
//     real error (not a silent success producing an inconsistent row) —
//     this is the items_location_household_consistency trigger added in
//     this same PR; see that migration's comment for why plain RLS can't
//     express this on its own
//   - household_id itself pointing at a household the caller isn't a
//     member of is rejected by items_access's own RLS, independent of the
//     trigger
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Duplicated from the other integration test files rather than extracted —
// see create-household-rpc.test.ts's comment on why self-containment beats
// a shared abstraction at this file count.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run \`npm run supabase:start\` then \`npx supabase ` +
        "status -o env\` to get API_URL/ANON_KEY/SERVICE_ROLE_KEY, and either " +
        "export them as SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY " +
        "yourself, or write them to a gitignored .env.rls.local so " +
        "`npm run test:rls` loads them automatically every time.",
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const serviceClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

function assertNotNull<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}

interface SeededHousehold {
  householdId: string;
  locationId: string;
  userId: string;
  email: string;
  password: string;
}

async function seedHouseholdWithOwnerAndLocation(label: string): Promise<SeededHousehold> {
  const email = `items-insert-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";

  const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) {
    throw new Error(`failed to create test user "${label}": ${userError.message}`);
  }

  const { data: household, error: householdError } = await serviceClient
    .from("households")
    .insert({ name: `Items insert test household ${label}` })
    .select()
    .single();
  if (householdError) {
    throw new Error(`failed to seed household "${label}": ${householdError.message}`);
  }

  const { error: memberError } = await serviceClient.from("household_members").insert({
    household_id: household.id,
    user_id: userData.user.id,
    role: "owner",
  });
  if (memberError) {
    throw new Error(`failed to seed membership for "${label}": ${memberError.message}`);
  }

  const { data: location, error: locationError } = await serviceClient
    .from("locations")
    .insert({ household_id: household.id, name: `Garage ${label}` })
    .select()
    .single();
  if (locationError) {
    throw new Error(`failed to seed location for "${label}": ${locationError.message}`);
  }

  return { householdId: household.id, locationId: location.id, userId: userData.user.id, email, password };
}

async function signInAs(email: string, password: string): Promise<SupabaseClient<Database>> {
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`failed to sign in as ${email}: ${error.message}`);
  }
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

describe("items insert (Stash flow real write)", () => {
  let householdA: SeededHousehold;
  let householdB: SeededHousehold;
  let clientA: SupabaseClient<Database>;

  beforeAll(async () => {
    householdA = await seedHouseholdWithOwnerAndLocation("a");
    householdB = await seedHouseholdWithOwnerAndLocation("b");
    clientA = await signInAs(householdA.email, householdA.password);
  }, 30_000);

  afterAll(async () => {
    // Deleting the households cascades to their locations (ON DELETE
    // CASCADE) but NOT to items (location_id/household_id are ON DELETE
    // RESTRICT) — any item this file creates is deleted explicitly first.
    await serviceClient.from("items").delete().in("household_id", [householdA.householdId, householdB.householdId]);
    await serviceClient.from("households").delete().in("id", [householdA.householdId, householdB.householdId]);
    await serviceClient.auth.admin.deleteUser(householdA.userId);
    await serviceClient.auth.admin.deleteUser(householdB.userId);
  });

  test("a member's real insert lands with the correct household_id, added_by, and location_id", async () => {
    const { data, error } = await clientA
      .from("items")
      .insert({
        name: "Spare key",
        location_id: householdA.locationId,
        detail: "Top drawer",
        household_id: householdA.householdId,
        added_by: householdA.userId,
      })
      .select()
      .single();

    expect(error).toBeNull();
    const item = assertNotNull(data, "items insert returned no data");
    expect(item.id).toBeTruthy();
    expect(item.household_id).toBe(householdA.householdId);
    expect(item.location_id).toBe(householdA.locationId);
    expect(item.added_by).toBe(householdA.userId);
    expect(item.name).toBe("Spare key");

    // Positive control that this is a real, queryable row, not just an
    // echoed insert payload.
    const { data: reread } = await serviceClient.from("items").select("id").eq("id", item.id).single();
    expect(reread?.id).toBe(item.id);
  });

  test("a location belonging to a different household is rejected — not a silently inconsistent row", async () => {
    const { data, error } = await clientA
      .from("items")
      .insert({
        name: "Spoofed item",
        location_id: householdB.locationId,
        household_id: householdA.householdId,
        added_by: householdA.userId,
      })
      .select()
      .single();

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // Raised from the items_location_household_consistency trigger
    // (P0001 = plpgsql RAISE EXCEPTION with no more specific SQLSTATE),
    // not the FK constraint — the location genuinely exists, just in the
    // wrong household.
    expect(error?.message).toMatch(/location_id must belong to the same household/);

    const { data: rows } = await serviceClient
      .from("items")
      .select("id")
      .eq("household_id", householdA.householdId)
      .eq("name", "Spoofed item");
    expect(rows).toHaveLength(0);
  });

  test("a household_id the caller isn't a member of is rejected, whether or not the location also matches it", async () => {
    // household_id and location_id are both genuinely household B's own
    // (internally consistent, so the new trigger's own row-shape check
    // would pass on the data alone) — this isolates "caller isn't a member
    // of B" as the only thing wrong with the request.
    //
    // In practice this is still caught by the trigger, not items_access's
    // own WITH CHECK: the trigger's existence check runs as the calling
    // role, so RLS on `locations` (locations_access, same
    // is_household_member gate) hides household B's location from a
    // household-A caller entirely — the row "doesn't exist" from where the
    // trigger is looking, exactly as if it were genuinely mismatched. Both
    // layers would reject this independently if asked to; this assertion
    // only confirms the request fails and creates nothing, not which layer
    // fired first.
    const { data, error } = await clientA
      .from("items")
      .insert({
        name: "Cross-household item",
        location_id: householdB.locationId,
        household_id: householdB.householdId,
        added_by: householdA.userId,
      })
      .select()
      .single();

    expect(data).toBeNull();
    expect(error).not.toBeNull();

    const { data: rows } = await serviceClient
      .from("items")
      .select("id")
      .eq("household_id", householdB.householdId)
      .eq("name", "Cross-household item");
    expect(rows).toHaveLength(0);
  });
});
