// Integration test — NOT part of `npm run test`. Run with `npm run test:rls`
// against a local Supabase stack (see rls-household-isolation.test.ts for
// the setup).
//
// household_members is the table that DEFINES who may touch a household. A
// member who could write to it could add strangers or evict their partner,
// so authenticated gets SELECT only; every membership change goes through a
// SECURITY DEFINER function (create_household / redeem_invite).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run \`npm run supabase:start\` then \`npx supabase ` +
        "status -o env\` and export SUPABASE_URL/SUPABASE_ANON_KEY/" +
        "SUPABASE_SERVICE_ROLE_KEY, or write them to a gitignored .env.rls.local.",
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const PERMISSION_DENIED = "42501";

const serviceClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

interface TestUser {
  id: string;
  email: string;
  password: string;
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `members-ro-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`failed to create test user "${label}": ${error.message}`);
  return { id: data.user.id, email, password };
}

async function signInAs(user: TestUser): Promise<SupabaseClient<Database>> {
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`failed to sign in as ${user.email}: ${error.message}`);
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function seedHousehold(name: string, members: TestUser[]): Promise<string> {
  const { data: household, error } = await serviceClient
    .from("households")
    .insert({ name })
    .select()
    .single();
  if (error) throw new Error(`failed to seed household "${name}": ${error.message}`);

  const { error: memberError } = await serviceClient.from("household_members").insert(
    members.map((user, index) => ({
      household_id: household.id,
      user_id: user.id,
      role: index === 0 ? "owner" : "member",
    })),
  );
  if (memberError) throw new Error(`failed to seed members for "${name}": ${memberError.message}`);
  return household.id;
}

describe("household_members is read-only for authenticated", () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let outsider: TestUser;
  let sharedHouseholdId: string;
  let otherHouseholdId: string;
  let aliceClient: SupabaseClient<Database>;

  beforeAll(async () => {
    [alice, bob, carol, outsider] = await Promise.all([
      createTestUser("alice"),
      createTestUser("bob"),
      createTestUser("carol"),
      createTestUser("outsider"),
    ]);
    sharedHouseholdId = await seedHousehold("members-ro shared", [alice, bob]);
    otherHouseholdId = await seedHousehold("members-ro other", [carol]);
    aliceClient = await signInAs(alice);
  }, 30_000);

  afterAll(async () => {
    await serviceClient
      .from("households")
      .delete()
      .in("id", [sharedHouseholdId, otherHouseholdId]);
    for (const user of [alice, bob, carol, outsider]) {
      await serviceClient.auth.admin.deleteUser(user.id);
    }
  });

  async function sharedMemberIds(): Promise<string[]> {
    const { data, error } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", sharedHouseholdId);
    expect(error).toBeNull();
    return (data ?? []).map((row) => row.user_id).sort();
  }

  test("a member can read the whole roster of their own household", async () => {
    const { data, error } = await aliceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", sharedHouseholdId);
    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.user_id).sort()).toEqual([alice.id, bob.id].sort());
  });

  test("a member cannot read another household's roster", async () => {
    // Positive control: the row exists, so an empty result is RLS omission.
    const { data: control } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", otherHouseholdId);
    expect(control).toHaveLength(1);

    const { data, error } = await aliceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", otherHouseholdId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test("a member cannot add someone to their own household", async () => {
    const { error } = await aliceClient
      .from("household_members")
      .insert({ household_id: sharedHouseholdId, user_id: outsider.id, role: "member" });
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain("permission denied for table household_members");
    expect(await sharedMemberIds()).toEqual([alice.id, bob.id].sort());
  });

  test("a member cannot add themselves to another household", async () => {
    const { error } = await aliceClient
      .from("household_members")
      .insert({ household_id: otherHouseholdId, user_id: alice.id, role: "member" });
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain("permission denied for table household_members");
  });

  test("a member cannot remove their partner", async () => {
    const { error } = await aliceClient
      .from("household_members")
      .delete()
      .eq("household_id", sharedHouseholdId)
      .eq("user_id", bob.id);
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain("permission denied for table household_members");
    expect(await sharedMemberIds()).toEqual([alice.id, bob.id].sort());
  });

  test("a member cannot change a role", async () => {
    const { error } = await aliceClient
      .from("household_members")
      .update({ role: "member" })
      .eq("household_id", sharedHouseholdId)
      .eq("user_id", alice.id);
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain("permission denied for table household_members");

    const { data } = await serviceClient
      .from("household_members")
      .select("role")
      .eq("household_id", sharedHouseholdId)
      .eq("user_id", alice.id)
      .single();
    expect(data?.role).toBe("owner");
  });
});
