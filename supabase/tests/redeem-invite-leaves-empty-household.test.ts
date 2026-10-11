// Integration test — NOT part of `npm run test`. Run with `npm run test:rls`
// against a local Supabase stack (setup: see rls-household-isolation.test.ts).
//
// redeem_invite also removes the caller's *other* households when the caller
// is alone in them and they hold no items or locations (ADR 0008), so a
// partner who already had an account lands in the shared household and Home
// shows it. Households with any data in them are never touched.
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

const serviceClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

interface TestUser {
  id: string;
  email: string;
  password: string;
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `redeem-cleanup-${label}-${randomUUID()}@example.com`;
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

describe("redeem_invite leaves the caller's empty household", () => {
  const userIds: string[] = [];
  const householdIds: string[] = [];
  let inviter: TestUser;
  let sharedHouseholdId: string;

  async function seedHousehold(name: string, members: TestUser[]): Promise<string> {
    const { data, error } = await serviceClient
      .from("households")
      .insert({ name })
      .select()
      .single();
    if (error) throw new Error(`failed to seed household: ${error.message}`);
    householdIds.push(data.id);
    const { error: memberError } = await serviceClient.from("household_members").insert(
      members.map((user, index) => ({
        household_id: data.id,
        user_id: user.id,
        role: index === 0 ? "owner" : "member",
      })),
    );
    if (memberError) throw new Error(`failed to seed members: ${memberError.message}`);
    return data.id;
  }

  async function newInvite(): Promise<string> {
    const { data, error } = await serviceClient
      .from("invites")
      .insert({ household_id: sharedHouseholdId, created_by: inviter.id })
      .select("code")
      .single();
    if (error) throw new Error(`failed to seed invite: ${error.message}`);
    return data.code;
  }

  async function householdExists(id: string): Promise<boolean> {
    const { data, error } = await serviceClient.from("households").select("id").eq("id", id);
    expect(error).toBeNull();
    return (data ?? []).length === 1;
  }

  async function membershipHouseholds(userId: string): Promise<string[]> {
    const { data, error } = await serviceClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId);
    expect(error).toBeNull();
    return (data ?? []).map((row) => row.household_id);
  }

  beforeAll(async () => {
    inviter = await createTestUser("inviter");
    userIds.push(inviter.id);
    sharedHouseholdId = await seedHousehold("cleanup shared", [inviter]);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", householdIds);
    for (const id of userIds) await serviceClient.auth.admin.deleteUser(id);
  });

  test("an existing user's empty solo household is deleted when they join", async () => {
    const joiner = await createTestUser("joiner-empty");
    userIds.push(joiner.id);
    const emptyId = await seedHousehold("joiner empty", [joiner]);
    const client = await signInAs(joiner);

    const { error } = await client.rpc("redeem_invite", { p_code: await newInvite() });
    expect(error).toBeNull();

    expect(await householdExists(emptyId)).toBe(false);
    expect(await membershipHouseholds(joiner.id)).toEqual([sharedHouseholdId]);
  });

  test("bootstrap-first then redeem ends with exactly one household (the shared one)", async () => {
    const joiner = await createTestUser("joiner-bootstrapped");
    userIds.push(joiner.id);
    const client = await signInAs(joiner);
    const { data: created, error: createError } = await client.rpc("create_household", {
      p_name: "Joiner's home",
    });
    expect(createError).toBeNull();
    if (typeof created === "string") householdIds.push(created);

    const { error } = await client.rpc("redeem_invite", { p_code: await newInvite() });
    expect(error).toBeNull();

    expect(await membershipHouseholds(joiner.id)).toEqual([sharedHouseholdId]);
  });

  test("a household that has a location is kept", async () => {
    const joiner = await createTestUser("joiner-location");
    userIds.push(joiner.id);
    const keptId = await seedHousehold("joiner with location", [joiner]);
    const { error: locationError } = await serviceClient
      .from("locations")
      .insert({ household_id: keptId, name: "Garage" });
    expect(locationError).toBeNull();
    const client = await signInAs(joiner);

    const { error } = await client.rpc("redeem_invite", { p_code: await newInvite() });
    expect(error).toBeNull();

    expect(await householdExists(keptId)).toBe(true);
    expect((await membershipHouseholds(joiner.id)).sort()).toEqual([keptId, sharedHouseholdId].sort());
  });

  test("a household that has an item is kept", async () => {
    const joiner = await createTestUser("joiner-item");
    userIds.push(joiner.id);
    const keptId = await seedHousehold("joiner with item", [joiner]);
    const { data: location, error: locationError } = await serviceClient
      .from("locations")
      .insert({ household_id: keptId, name: "Hall" })
      .select()
      .single();
    expect(locationError).toBeNull();
    const { error: itemError } = await serviceClient.from("items").insert({
      household_id: keptId,
      location_id: location?.id ?? "",
      name: "Passport",
      added_by: joiner.id,
    });
    expect(itemError).toBeNull();
    const client = await signInAs(joiner);

    const { error } = await client.rpc("redeem_invite", { p_code: await newInvite() });
    expect(error).toBeNull();

    expect(await householdExists(keptId)).toBe(true);
  });

  test("an empty household that still has another member is kept", async () => {
    const joiner = await createTestUser("joiner-shared-empty");
    const otherMember = await createTestUser("other-member");
    userIds.push(joiner.id, otherMember.id);
    const keptId = await seedHousehold("empty but shared", [otherMember, joiner]);
    const client = await signInAs(joiner);

    const { error } = await client.rpc("redeem_invite", { p_code: await newInvite() });
    expect(error).toBeNull();

    expect(await householdExists(keptId)).toBe(true);
    expect((await membershipHouseholds(otherMember.id))).toEqual([keptId]);
  });

  test("a rejected redemption deletes nothing", async () => {
    const joiner = await createTestUser("joiner-rejected");
    userIds.push(joiner.id);
    const emptyId = await seedHousehold("joiner empty rejected", [joiner]);
    const client = await signInAs(joiner);

    const { error } = await client.rpc("redeem_invite", { p_code: "no-such-code" });
    expect(error?.message).toContain("invite not found");

    expect(await householdExists(emptyId)).toBe(true);
  });

  test("the inviter redeeming their own code does not delete the household they invited from", async () => {
    const { error } = await (await signInAs(inviter)).rpc("redeem_invite", {
      p_code: await newInvite(),
    });
    expect(error).toBeNull();
    expect(await householdExists(sharedHouseholdId)).toBe(true);
  });
});
