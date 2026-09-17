// Integration test for the Item-edit/detail flow's real write paths
// (item-edit-form.tsx's direct `.from("items").update(...)`, its
// `.rpc("move_item", ...)` call, and its direct `.from("items").delete(...)`)
// — NOT part of `npm run test` (see vitest.config.mts's exclude). Requires a
// running local Supabase stack with every migration through
// 20260914090000_move_item_rpc.sql applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// items-insert.test.ts for the same shortcut) if you've written one;
// otherwise export them yourself before running this.
//
// move_item's own RPC contract (cross-household rejection, RLS visibility)
// is already covered in isolation by move-item-rpc.test.ts — this file
// instead proves the specific combination item-edit-form.tsx relies on:
// a real name/detail-only edit (plain UPDATE), a real location-changing
// edit (move_item), and a real delete, each exercised end-to-end exactly
// the way the form itself calls them.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

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
  locationAId: string;
  locationBId: string;
  userId: string;
  email: string;
  password: string;
}

async function seedHouseholdWithOwnerAndTwoLocations(label: string): Promise<SeededHousehold> {
  const email = `items-edit-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `Items edit test household ${label}` })
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

  const { data: locationA, error: locationAError } = await serviceClient
    .from("locations")
    .insert({ household_id: household.id, name: `Room A ${label}` })
    .select()
    .single();
  if (locationAError) {
    throw new Error(`failed to seed location A for "${label}": ${locationAError.message}`);
  }

  const { data: locationB, error: locationBError } = await serviceClient
    .from("locations")
    .insert({ household_id: household.id, name: `Room B ${label}` })
    .select()
    .single();
  if (locationBError) {
    throw new Error(`failed to seed location B for "${label}": ${locationBError.message}`);
  }

  return {
    householdId: household.id,
    locationAId: locationA.id,
    locationBId: locationB.id,
    userId: userData.user.id,
    email,
    password,
  };
}

async function seedItem(householdId: string, locationId: string, addedBy: string, name: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("items")
    .insert({ household_id: householdId, location_id: locationId, name, added_by: addedBy })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to seed item "${name}": ${error.message}`);
  }
  return data.id;
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

describe("Item edit/delete (real write paths)", () => {
  let household: SeededHousehold;
  let outsiderHousehold: SeededHousehold;
  let client: SupabaseClient<Database>;

  beforeAll(async () => {
    household = await seedHouseholdWithOwnerAndTwoLocations("owner");
    outsiderHousehold = await seedHouseholdWithOwnerAndTwoLocations("outsider");
    client = await signInAs(household.email, household.password);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [household.householdId, outsiderHousehold.householdId]);
    await serviceClient.auth.admin.deleteUser(household.userId);
    await serviceClient.auth.admin.deleteUser(outsiderHousehold.userId);
  });

  test("a real name/detail-only edit (plain UPDATE) persists and leaves location_id untouched", async () => {
    const itemId = await seedItem(household.householdId, household.locationAId, household.userId, "Bike pump");

    const { data, error } = await client
      .from("items")
      .update({ name: "Bike pump (blue)", detail: "Top shelf" })
      .eq("id", itemId)
      .select()
      .single();

    expect(error).toBeNull();
    const updated = assertNotNull(data, "update returned no data");
    expect(updated.name).toBe("Bike pump (blue)");
    expect(updated.detail).toBe("Top shelf");
    expect(updated.location_id).toBe(household.locationAId);

    const { data: reread } = await serviceClient.from("items").select("*").eq("id", itemId).single();
    expect(reread?.name).toBe("Bike pump (blue)");
  });

  test("a real location-changing edit exercises move_item and persists the new location", async () => {
    const itemId = await seedItem(household.householdId, household.locationAId, household.userId, "Passport");

    const { data, error } = await client.rpc("move_item", {
      p_item_id: itemId,
      p_new_location_id: household.locationBId,
    });

    expect(error).toBeNull();
    const moved = assertNotNull(data, "move_item returned no data");
    expect(moved.location_id).toBe(household.locationBId);
    expect(moved.last_moved_by).toBe(household.userId);

    const { data: reread } = await serviceClient.from("items").select("location_id").eq("id", itemId).single();
    expect(reread?.location_id).toBe(household.locationBId);
  });

  test("moving an item to a location outside the household is rejected with move_item's own specific error", async () => {
    const itemId = await seedItem(household.householdId, household.locationAId, household.userId, "Spare keys");

    const { data, error } = await client.rpc("move_item", {
      p_item_id: itemId,
      p_new_location_id: outsiderHousehold.locationAId,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_item:/);

    const { data: reread } = await serviceClient.from("items").select("location_id").eq("id", itemId).single();
    expect(reread?.location_id).toBe(household.locationAId);
  });

  test("a real delete removes the item row, and a member outside the household can't delete it", async () => {
    const itemId = await seedItem(household.householdId, household.locationAId, household.userId, "Camping tent");
    const outsiderClient = await signInAs(outsiderHousehold.email, outsiderHousehold.password);

    // RLS makes the row invisible to a non-member, so the delete matches
    // zero rows rather than erroring — same shape as any other RLS-scoped
    // write against a row the caller can't see.
    const { error: outsiderError } = await outsiderClient.from("items").delete().eq("id", itemId);
    expect(outsiderError).toBeNull();
    const { data: stillThere } = await serviceClient.from("items").select("id").eq("id", itemId).maybeSingle();
    expect(stillThere?.id).toBe(itemId);

    const { error } = await client.from("items").delete().eq("id", itemId);
    expect(error).toBeNull();

    const { data: reread } = await serviceClient.from("items").select("id").eq("id", itemId).maybeSingle();
    expect(reread).toBeNull();
  });
});
