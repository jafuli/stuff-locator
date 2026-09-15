// Integration test proving the move_container RPC's guarantees — NOT part
// of `npm run test` (see vitest.config.mts's exclude). Requires a running
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
//   - a household member can move a location under a new parent within
//     their own household, and parent_id reflects the change
//   - moving a location to become the child of its own descendant is
//     rejected, parent_id unchanged
//   - moving a location to be its own parent is rejected
//   - moving a location under a parent in a DIFFERENT household is
//     rejected — using a caller who is a member of BOTH households, to
//     isolate this from the RLS-visibility case
//   - NULL as the new parent promotes a location to top-level successfully
//   - a caller who isn't a member of the location's household can't move
//     it at all
//   - a nonexistent location or new-parent id fails clearly
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

async function createTestUser(label: string): Promise<{ userId: string; email: string; password: string }> {
  const email = `move-container-test-${label}-${randomUUID()}@example.com`;
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

// Supabase's generated types don't mark this RPC's nullable `uuid`
// parameter as nullable (a known gap in `supabase gen types typescript`
// for scalar function args — it has no way to see that the underlying SQL
// parameter accepts NULL). p_new_parent_id genuinely accepts NULL at the
// SQL level (see the migration; that's how a location is promoted to the
// top). This narrows the type locally at the call site rather than
// hand-editing the generated database.types.ts file itself.
interface MoveContainerArgs {
  p_location_id: string;
  p_new_parent_id: string | null;
}

function moveContainer(client: SupabaseClient<Database>, args: MoveContainerArgs) {
  return client.rpc(
    "move_container",
    args as Database["public"]["Functions"]["move_container"]["Args"],
  );
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

describe("move_container RPC", () => {
  let householdId: string;
  let otherHouseholdId: string;
  let owner: { userId: string; email: string; password: string };
  let outsider: { userId: string; email: string; password: string };
  let dualMember: { userId: string; email: string; password: string };
  let clientOwner: SupabaseClient<Database>;
  let clientOutsider: SupabaseClient<Database>;
  let clientDualMember: SupabaseClient<Database>;

  beforeAll(async () => {
    householdId = await createHousehold("move_container test household");
    otherHouseholdId = await createHousehold("move_container other household");

    owner = await createTestUser("owner");
    outsider = await createTestUser("outsider");
    dualMember = await createTestUser("dual-member");

    await addMember(householdId, owner.userId);
    await addMember(householdId, dualMember.userId);
    await addMember(otherHouseholdId, dualMember.userId);
    // `outsider` deliberately joins neither household.

    clientOwner = await signInAs(owner.email, owner.password);
    clientOutsider = await signInAs(outsider.email, outsider.password);
    clientDualMember = await signInAs(dualMember.email, dualMember.password);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [householdId, otherHouseholdId]);
    await serviceClient.auth.admin.deleteUser(owner.userId);
    await serviceClient.auth.admin.deleteUser(outsider.userId);
    await serviceClient.auth.admin.deleteUser(dualMember.userId);
  });

  test("a member can move a location under a new parent within their own household", async () => {
    const parentA = await createLocation(householdId, "Parent A");
    const parentB = await createLocation(householdId, "Parent B");
    const child = await createLocation(householdId, "Movable child", parentA);

    const { data, error } = await moveContainer(clientOwner, {
      p_location_id: child,
      p_new_parent_id: parentB,
    });
    expect(error).toBeNull();
    const updated = assertNotNull(data, "move_container returned no data");
    expect(updated.parent_id).toBe(parentB);

    const { data: reread } = await serviceClient.from("locations").select("parent_id").eq("id", child).single();
    expect(reread?.parent_id).toBe(parentB);
  });

  test("moving a location under its own descendant is rejected, parent_id unchanged", async () => {
    const grandparent = await createLocation(householdId, "Grandparent");
    const parent = await createLocation(householdId, "Parent", grandparent);
    const child = await createLocation(householdId, "Child", parent);

    const { data, error } = await moveContainer(clientOwner, {
      p_location_id: grandparent,
      p_new_parent_id: child,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_container:.*own descendant/i);

    const { data: reread } = await serviceClient
      .from("locations")
      .select("parent_id")
      .eq("id", grandparent)
      .single();
    expect(reread?.parent_id).toBeNull();
  });

  test("moving a location to be its own parent is rejected", async () => {
    const loc = await createLocation(householdId, "Self-parent attempt");

    const { data, error } = await moveContainer(clientOwner, {
      p_location_id: loc,
      p_new_parent_id: loc,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_container:.*under itself/i);
  });

  test("moving a location under a parent in a different household is rejected, even for a caller who can see both", async () => {
    const locInHousehold = await createLocation(householdId, "Mine");
    const parentInOtherHousehold = await createLocation(otherHouseholdId, "Not mine");

    const { data, error } = await moveContainer(clientDualMember, {
      p_location_id: locInHousehold,
      p_new_parent_id: parentInOtherHousehold,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_container:.*different households/i);

    const { data: reread } = await serviceClient
      .from("locations")
      .select("parent_id")
      .eq("id", locInHousehold)
      .single();
    expect(reread?.parent_id).toBeNull();
  });

  test("passing NULL as the new parent promotes a location to top-level successfully", async () => {
    const parent = await createLocation(householdId, "Some parent");
    const child = await createLocation(householdId, "Promotable child", parent);

    const { data, error } = await moveContainer(clientOwner, {
      p_location_id: child,
      p_new_parent_id: null,
    });
    expect(error).toBeNull();
    const updated = assertNotNull(data, "move_container returned no data");
    expect(updated.parent_id).toBeNull();
  });

  test("a caller who is not a member of the location's household cannot move it at all", async () => {
    const loc = await createLocation(householdId, "Not outsider's to move");
    const otherParent = await createLocation(householdId, "Some other parent");

    const { data, error } = await moveContainer(clientOutsider, {
      p_location_id: loc,
      p_new_parent_id: otherParent,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/move_container:.*not found or not accessible/i);

    const { data: reread } = await serviceClient.from("locations").select("parent_id").eq("id", loc).single();
    expect(reread?.parent_id).toBeNull();
  });

  test("a nonexistent location id or new-parent id fails clearly", async () => {
    const realLocation = await createLocation(householdId, "Real location");

    const { data: badLocationData, error: badLocationError } = await moveContainer(clientOwner, {
      p_location_id: randomUUID(),
      p_new_parent_id: realLocation,
    });
    expect(badLocationData).toBeNull();
    expect(badLocationError).not.toBeNull();
    expect(badLocationError?.message).toMatch(/move_container:.*location not found or not accessible/i);

    const { data: badParentData, error: badParentError } = await moveContainer(clientOwner, {
      p_location_id: realLocation,
      p_new_parent_id: randomUUID(),
    });
    expect(badParentData).toBeNull();
    expect(badParentError).not.toBeNull();
    expect(badParentError?.message).toMatch(/move_container:.*new parent location not found/i);
  });
});
