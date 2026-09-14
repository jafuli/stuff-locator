// Integration test proving the delete_container RPC's guarantees — NOT
// part of `npm run test` (see vitest.config.mts's exclude). Requires a
// running local Supabase stack with this migration applied:
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
//   - a member can delete a genuinely empty leaf location, confirmed gone
//     via a follow-up SELECT
//   - deleting a location with a child location is rejected, and both
//     still exist afterward (row counts, not just the caught error)
//   - deleting a location with a direct item is rejected, and both still
//     exist afterward — proven as a case DISTINCT from the child-location
//     one, so each check is verified independently
//   - a non-member of the location's household can't delete it at all
//   - a nonexistent location id fails clearly rather than silently
//     succeeding
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

async function createTestUser(label: string): Promise<{ userId: string; email: string; password: string }> {
  const email = `delete-container-test-${label}-${randomUUID()}@example.com`;
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

async function addMember(householdId: string, userId: string) {
  const { error } = await serviceClient
    .from("household_members")
    .insert({ household_id: householdId, user_id: userId, role: "owner" });
  if (error) {
    throw new Error(`failed to add member ${userId} to ${householdId}: ${error.message}`);
  }
}

async function createHousehold(name: string): Promise<string> {
  const { data, error } = await serviceClient.from("households").insert({ name }).select().single();
  if (error) {
    throw new Error(`failed to create household "${name}": ${error.message}`);
  }
  return data.id;
}

async function createLocation(householdId: string, name: string, parentId: string | null = null): Promise<string> {
  const { data, error } = await serviceClient
    .from("locations")
    .insert({ household_id: householdId, name, parent_id: parentId })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to create location "${name}": ${error.message}`);
  }
  return data.id;
}

async function createItem(householdId: string, locationId: string, addedBy: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("items")
    .insert({ household_id: householdId, location_id: locationId, name: "Test item", added_by: addedBy })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to create item: ${error.message}`);
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

describe("delete_container RPC", () => {
  let householdId: string;
  let outsiderHouseholdId: string;
  let owner: { userId: string; email: string; password: string };
  let outsider: { userId: string; email: string; password: string };
  let clientOwner: SupabaseClient<Database>;
  let clientOutsider: SupabaseClient<Database>;

  beforeAll(async () => {
    householdId = await createHousehold("delete_container test household");
    outsiderHouseholdId = await createHousehold("delete_container outsider household");

    owner = await createTestUser("owner");
    outsider = await createTestUser("outsider");
    await addMember(householdId, owner.userId);
    await addMember(outsiderHouseholdId, outsider.userId);

    clientOwner = await signInAs(owner.email, owner.password);
    clientOutsider = await signInAs(outsider.email, outsider.password);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [householdId, outsiderHouseholdId]);
    await serviceClient.auth.admin.deleteUser(owner.userId);
    await serviceClient.auth.admin.deleteUser(outsider.userId);
  });

  test("a member can delete a genuinely empty leaf location", async () => {
    const leafId = await createLocation(householdId, "Empty shelf");

    const { data, error } = await clientOwner.rpc("delete_container", { p_location_id: leafId });
    expect(error).toBeNull();
    expect(data?.id).toBe(leafId);
    expect(data?.name).toBe("Empty shelf");

    const { data: reread, error: rereadError } = await serviceClient
      .from("locations")
      .select("id")
      .eq("id", leafId);
    expect(rereadError).toBeNull();
    expect(reread).toHaveLength(0);
  });

  test("deleting a location with a child location is rejected, and both still exist afterward", async () => {
    const parentId = await createLocation(householdId, "Parent with child");
    const childId = await createLocation(householdId, "Child", parentId);

    const { data, error } = await clientOwner.rpc("delete_container", { p_location_id: parentId });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/delete_container:.*child locations/i);

    const { data: rows } = await serviceClient
      .from("locations")
      .select("id")
      .in("id", [parentId, childId]);
    expect(rows).toHaveLength(2);
  });

  test("deleting a location with a direct item is rejected, and both still exist afterward — a distinct case from the child-location one", async () => {
    const locationId = await createLocation(householdId, "Holds an item");
    const itemId = await createItem(householdId, locationId, owner.userId);

    const { data, error } = await clientOwner.rpc("delete_container", { p_location_id: locationId });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/delete_container:.*items/i);
    expect(error?.message).not.toMatch(/child locations/i);

    const { data: locationRows } = await serviceClient
      .from("locations")
      .select("id")
      .eq("id", locationId);
    expect(locationRows).toHaveLength(1);

    const { data: itemRows } = await serviceClient.from("items").select("id").eq("id", itemId);
    expect(itemRows).toHaveLength(1);
  });

  test("a non-member of the location's household cannot delete it", async () => {
    const leafId = await createLocation(householdId, "Not yours to delete");

    const { data, error } = await clientOutsider.rpc("delete_container", { p_location_id: leafId });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/delete_container:.*not found or not accessible/i);

    const { data: stillThere } = await serviceClient.from("locations").select("id").eq("id", leafId);
    expect(stillThere).toHaveLength(1);
  });

  test("a nonexistent location id fails clearly rather than silently succeeding", async () => {
    const { data, error } = await clientOwner.rpc("delete_container", { p_location_id: randomUUID() });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/delete_container:.*not found or not accessible/i);
  });
});
