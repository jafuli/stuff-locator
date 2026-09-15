// Integration test proving the move_item RPC's guarantees — NOT part of
// `npm run test` (see vitest.config.mts's exclude). Requires a running
// local Supabase stack with this migration applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// rls-household-isolation.test.ts for the same shortcut) if you've written
// one; otherwise export them yourself before running this.
//
// Covers the RPC's full contract:
//   - a household member can move an item to another location within
//     their own household, and the row reflects the new location_id plus
//     correct last_moved_by/last_moved_at
//   - moving an item into a location that belongs to a DIFFERENT household
//     is rejected — using a caller who is a member of BOTH households, so
//     this is provably the RPC's own explicit cross-household check firing,
//     not RLS merely hiding a location the caller couldn't see anyway
//   - a caller who isn't a member of the item's household can't move it at
//     all (the item itself is invisible to them under RLS)
//   - a nonexistent destination location id fails clearly, not silently
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
  itemId: string;
}

async function seedHousehold(label: string): Promise<SeededHousehold> {
  const { data: household, error: householdError } = await serviceClient
    .from("households")
    .insert({ name: `move_item test household ${label}` })
    .select()
    .single();
  if (householdError) {
    throw new Error(`failed to seed household "${label}": ${householdError.message}`);
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

  return { householdId: household.id, locationAId: locationA.id, locationBId: locationB.id, itemId: "" };
}

async function addMember(householdId: string, userId: string, role: "owner" | "member") {
  const { error } = await serviceClient
    .from("household_members")
    .insert({ household_id: householdId, user_id: userId, role });
  if (error) {
    throw new Error(`failed to add member ${userId} to ${householdId}: ${error.message}`);
  }
}

async function addItem(householdId: string, locationId: string, addedBy: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("items")
    .insert({ household_id: householdId, location_id: locationId, name: "Test item", added_by: addedBy })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to seed item: ${error.message}`);
  }
  return data.id;
}

async function createTestUser(label: string): Promise<{ userId: string; email: string; password: string }> {
  const email = `move-item-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`failed to create test user "${label}": ${error.message}`);
  }
  return { userId: data.user.id, email, password };
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

describe("move_item RPC", () => {
  let householdA: SeededHousehold;
  let householdB: SeededHousehold;
  let ownerA: { userId: string; email: string; password: string };
  let outsider: { userId: string; email: string; password: string };
  let dualMember: { userId: string; email: string; password: string };
  let clientOwnerA: SupabaseClient<Database>;
  let clientOutsider: SupabaseClient<Database>;
  let clientDualMember: SupabaseClient<Database>;
  let itemInA: string;

  beforeAll(async () => {
    householdA = await seedHousehold("a");
    householdB = await seedHousehold("b");

    ownerA = await createTestUser("owner-a");
    outsider = await createTestUser("outsider");
    dualMember = await createTestUser("dual-member");

    await addMember(householdA.householdId, ownerA.userId, "owner");
    await addMember(householdA.householdId, dualMember.userId, "member");
    await addMember(householdB.householdId, dualMember.userId, "member");
    // `outsider` deliberately joins neither household.

    itemInA = await addItem(householdA.householdId, householdA.locationAId, ownerA.userId);

    clientOwnerA = await signInAs(ownerA.email, ownerA.password);
    clientOutsider = await signInAs(outsider.email, outsider.password);
    clientDualMember = await signInAs(dualMember.email, dualMember.password);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [householdA.householdId, householdB.householdId]);
    await serviceClient.auth.admin.deleteUser(ownerA.userId);
    await serviceClient.auth.admin.deleteUser(outsider.userId);
    await serviceClient.auth.admin.deleteUser(dualMember.userId);
  });

  test("a household member can move an item to another location within their own household", async () => {
    const { data, error } = await clientOwnerA.rpc("move_item", {
      p_item_id: itemInA,
      p_new_location_id: householdA.locationBId,
    });
    expect(error).toBeNull();
    const updated = assertNotNull(data, "move_item returned no data");
    expect(updated.location_id).toBe(householdA.locationBId);
    expect(updated.last_moved_by).toBe(ownerA.userId);
    expect(updated.last_moved_at).toBeTruthy();

    // Confirm it actually persisted, via a fresh read.
    const { data: reread } = await serviceClient.from("items").select("*").eq("id", itemInA).single();
    expect(reread?.location_id).toBe(householdA.locationBId);
  });

  test("moving an item to a location in a different household is rejected, even for a caller who can see both", async () => {
    // dualMember is a real member of BOTH households, so household B's
    // location IS visible to them under RLS — isolating this from the
    // separate "caller can't see the target at all" case below. The
    // rejection here must come from the RPC's own explicit household_id
    // comparison.
    const itemInAForDualCheck = await addItem(
      householdA.householdId,
      householdA.locationAId,
      ownerA.userId,
    );

    const { data, error } = await clientDualMember.rpc("move_item", {
      p_item_id: itemInAForDualCheck,
      p_new_location_id: householdB.locationAId,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_item:.*different households/i);

    const { data: unchanged } = await serviceClient
      .from("items")
      .select("location_id")
      .eq("id", itemInAForDualCheck)
      .single();
    expect(unchanged?.location_id).toBe(householdA.locationAId);
  });

  test("a caller who is not a member of the item's household cannot move it at all", async () => {
    const { data: before } = await serviceClient.from("items").select("location_id").eq("id", itemInA).single();

    const { data, error } = await clientOutsider.rpc("move_item", {
      p_item_id: itemInA,
      p_new_location_id: householdA.locationAId,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_item:.*not found or not accessible/i);

    const { data: after } = await serviceClient.from("items").select("location_id").eq("id", itemInA).single();
    expect(after?.location_id).toBe(before?.location_id);
  });

  test("a nonexistent destination location id fails clearly rather than silently updating", async () => {
    const { data: before } = await serviceClient.from("items").select("location_id").eq("id", itemInA).single();

    const { data, error } = await clientOwnerA.rpc("move_item", {
      p_item_id: itemInA,
      p_new_location_id: randomUUID(),
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_item:.*destination location not found/i);

    const { data: after } = await serviceClient.from("items").select("location_id").eq("id", itemInA).single();
    expect(after?.location_id).toBe(before?.location_id);
  });
});
