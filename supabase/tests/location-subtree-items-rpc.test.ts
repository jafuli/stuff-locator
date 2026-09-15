// Integration test proving the location_subtree_items RPC's guarantees —
// NOT part of `npm run test` (see vitest.config.mts's exclude). Requires a
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
// This is a read-only recursive query, not a write with invariants — every
// "no access" case below is expected to return zero rows, not an error.
// Covers:
//   - a 3-level hierarchy (grandparent -> parent -> child) with one item
//     at each level, plus a sibling subtree with its own item: calling on
//     the grandparent returns exactly the 3 chain items and excludes the
//     sibling's
//   - a leaf location with one item returns exactly that item
//   - a location with nothing in its subtree returns zero rows, not an
//     error
//   - a caller who isn't a member of the location's household gets zero
//     rows back
//   - a nonexistent location id returns zero rows
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
  const email = `location-subtree-test-${label}-${randomUUID()}@example.com`;
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

async function createItem(householdId: string, locationId: string, addedBy: string, name: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("items")
    .insert({ household_id: householdId, location_id: locationId, name, added_by: addedBy })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to create item "${name}": ${error.message}`);
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

describe("location_subtree_items RPC", () => {
  let householdId: string;
  let outsiderHouseholdId: string;
  let owner: { userId: string; email: string; password: string };
  let outsider: { userId: string; email: string; password: string };
  let clientOwner: SupabaseClient<Database>;
  let clientOutsider: SupabaseClient<Database>;

  let grandparentId: string;
  let parentId: string;
  let childId: string;
  let siblingId: string;
  let grandparentItemId: string;
  let parentItemId: string;
  let childItemId: string;
  let siblingItemId: string;
  let emptyLeafId: string;

  beforeAll(async () => {
    householdId = await createHousehold("subtree test household");
    outsiderHouseholdId = await createHousehold("subtree outsider household");

    owner = await createTestUser("owner");
    outsider = await createTestUser("outsider");
    await addMember(householdId, owner.userId);
    await addMember(outsiderHouseholdId, outsider.userId);

    clientOwner = await signInAs(owner.email, owner.password);
    clientOutsider = await signInAs(outsider.email, outsider.password);

    // grandparent -> parent -> child, one item at each level.
    grandparentId = await createLocation(householdId, "Grandparent");
    parentId = await createLocation(householdId, "Parent", grandparentId);
    childId = await createLocation(householdId, "Child", parentId);
    grandparentItemId = await createItem(householdId, grandparentId, owner.userId, "Grandparent item");
    parentItemId = await createItem(householdId, parentId, owner.userId, "Parent item");
    childItemId = await createItem(householdId, childId, owner.userId, "Child item");

    // A sibling subtree, NOT a descendant of grandparent, with its own item.
    siblingId = await createLocation(householdId, "Sibling");
    siblingItemId = await createItem(householdId, siblingId, owner.userId, "Sibling item");

    // A leaf with no items anywhere in its subtree.
    emptyLeafId = await createLocation(householdId, "Empty leaf");
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [householdId, outsiderHouseholdId]);
    await serviceClient.auth.admin.deleteUser(owner.userId);
    await serviceClient.auth.admin.deleteUser(outsider.userId);
  });

  test("returns exactly the chain's 3 items and excludes the sibling's", async () => {
    const { data, error } = await clientOwner.rpc("location_subtree_items", {
      p_location_id: grandparentId,
    });
    expect(error).toBeNull();
    const ids = (data ?? []).map((item) => item.id).sort();
    expect(ids).toEqual([grandparentItemId, parentItemId, childItemId].sort());
    expect(ids).not.toContain(siblingItemId);
  });

  test("a leaf with one item returns exactly that item", async () => {
    const { data, error } = await clientOwner.rpc("location_subtree_items", {
      p_location_id: childId,
    });
    expect(error).toBeNull();
    expect((data ?? []).map((item) => item.id)).toEqual([childItemId]);
  });

  test("a location with nothing in its subtree returns zero rows, not an error", async () => {
    const { data, error } = await clientOwner.rpc("location_subtree_items", {
      p_location_id: emptyLeafId,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test("a caller who is not a member of the location's household gets zero rows back", async () => {
    const { data, error } = await clientOutsider.rpc("location_subtree_items", {
      p_location_id: grandparentId,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test("a nonexistent location id returns zero rows", async () => {
    const { data, error } = await clientOwner.rpc("location_subtree_items", {
      p_location_id: randomUUID(),
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
