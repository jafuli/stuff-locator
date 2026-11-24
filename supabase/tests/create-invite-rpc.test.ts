// Integration test for create_invite and the couple-only rule
// (20261124121107_create_invite.sql, ADR 0015) — NOT part of `npm run test`.
// Requires a running local Supabase stack; run with `npm run test:rls`.
//
// The invite page (src/app/(app)/settings/invite/page.tsx) is an async
// Server Component that only calls create_invite, so this proves its real
// write path. Rendering is covered by e2e/invite-partner.spec.ts.
//
// Proves:
//   - create_invite makes an invite scoped to the caller's own household
//   - it returns the live invite again instead of making another, including
//     under concurrent calls (the race the old read-then-insert page had)
//   - an expired invite is not handed out
//   - a household with two members gets SL005 and no new invite
//   - redeem_invite refuses a third member (SL005), even with a valid code
//   - authenticated can no longer insert invites directly
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
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

interface SeededUser {
  householdId: string;
  userId: string;
  email: string;
  password: string;
}

async function seedHouseholdWithOwner(label: string): Promise<SeededUser> {
  const email = `create-invite-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `create_invite test household ${label}` })
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

  return { householdId: household.id, userId: userData.user.id, email, password };
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

async function createUser(label: string): Promise<{ userId: string; email: string; password: string }> {
  const email = `create-invite-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    throw new Error(`failed to create test user "${label}": ${error.message}`);
  }
  return { userId: data.user.id, email, password };
}

async function liveInviteCount(householdId: string): Promise<number> {
  const { count, error } = await serviceClient
    .from("invites")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .is("redeemed_at", null);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

const HOUSEHOLD_FULL = "SL005";

describe("create_invite and couple-only households", () => {
  const createdHouseholdIds: string[] = [];
  const createdUserIds: string[] = [];

  async function seeded(label: string): Promise<SeededUser & { client: SupabaseClient<Database> }> {
    const owner = await seedHouseholdWithOwner(label);
    createdHouseholdIds.push(owner.householdId);
    createdUserIds.push(owner.userId);
    return { ...owner, client: await signInAs(owner.email, owner.password) };
  }

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", createdHouseholdIds);
    for (const userId of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(userId);
    }
  });

  test("creates an invite scoped to the caller's own household, then hands back the same one", async () => {
    const owner = await seeded("reuse");

    const first = await owner.client.rpc("create_invite");
    expect(first.error).toBeNull();
    expect(first.data?.household_id).toBe(owner.householdId);
    expect(first.data?.created_by).toBe(owner.userId);
    expect(first.data?.code).toMatch(/^[0-9a-f]{12}$/);
    expect(first.data?.redeemed_at).toBeNull();

    const second = await owner.client.rpc("create_invite");
    expect(second.error).toBeNull();
    expect(second.data?.code).toBe(first.data?.code);
    expect(await liveInviteCount(owner.householdId)).toBe(1);
  });

  test("concurrent calls on a household with no live invite all get one and the same code", async () => {
    const owner = await seeded("race");

    const results = await Promise.all([
      owner.client.rpc("create_invite"),
      owner.client.rpc("create_invite"),
      owner.client.rpc("create_invite"),
    ]);

    expect(results.map((result) => result.error)).toEqual([null, null, null]);
    expect(new Set(results.map((result) => result.data?.code)).size).toBe(1);
    expect(await liveInviteCount(owner.householdId)).toBe(1);
  });

  test("an expired invite is not handed out; a fresh one is made", async () => {
    const owner = await seeded("expired");
    const { data: expired, error } = await serviceClient
      .from("invites")
      .insert({
        household_id: owner.householdId,
        created_by: owner.userId,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .select("code")
      .single();
    expect(error).toBeNull();

    const { data, error: createError } = await owner.client.rpc("create_invite");
    expect(createError).toBeNull();
    expect(data?.code).not.toBe(expired?.code);
  });

  test("a household with two members gets SL005 and no new invite", async () => {
    const owner = await seeded("full");
    const partner = await createUser("full-partner");
    createdUserIds.push(partner.userId);
    await serviceClient.from("household_members").insert({ household_id: owner.householdId, user_id: partner.userId });

    const { data, error } = await owner.client.rpc("create_invite");
    expect(data).toBeNull();
    expect(error?.code).toBe(HOUSEHOLD_FULL);
    expect(await liveInviteCount(owner.householdId)).toBe(0);
  });

  test("redeem_invite refuses a third member, even with a valid code", async () => {
    const owner = await seeded("third");
    const { data: invite } = await owner.client.rpc("create_invite");
    const partner = await createUser("third-partner");
    const stranger = await createUser("third-stranger");
    createdUserIds.push(partner.userId, stranger.userId);

    // The partner joins with a different code, so the owner's code is still live.
    await serviceClient.from("household_members").insert({ household_id: owner.householdId, user_id: partner.userId });

    const strangerClient = await signInAs(stranger.email, stranger.password);
    const { error } = await strangerClient.rpc("redeem_invite", { p_code: invite?.code ?? "" });
    expect(error?.code).toBe(HOUSEHOLD_FULL);

    const { count } = await serviceClient
      .from("household_members")
      .select("user_id", { count: "exact", head: true })
      .eq("household_id", owner.householdId);
    expect(count).toBe(2);

    // The code is not consumed by a refused redemption.
    const { data: stillLive } = await serviceClient
      .from("invites")
      .select("redeemed_at")
      .eq("code", invite?.code ?? "")
      .single();
    expect(stillLive?.redeemed_at).toBeNull();
  });

  test("two people redeeming the same household's two codes at once: only one gets in", async () => {
    const owner = await seeded("double");
    const { data: firstInvite } = await owner.client.rpc("create_invite");
    const { data: secondInvite } = await serviceClient
      .from("invites")
      .insert({ household_id: owner.householdId, created_by: owner.userId })
      .select("code")
      .single();
    const joinerA = await createUser("double-a");
    const joinerB = await createUser("double-b");
    createdUserIds.push(joinerA.userId, joinerB.userId);
    const [clientJoinerA, clientJoinerB] = await Promise.all([
      signInAs(joinerA.email, joinerA.password),
      signInAs(joinerB.email, joinerB.password),
    ]);

    const results = await Promise.all([
      clientJoinerA.rpc("redeem_invite", { p_code: firstInvite?.code ?? "" }),
      clientJoinerB.rpc("redeem_invite", { p_code: secondInvite?.code ?? "" }),
    ]);

    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    const refused = results.find((result) => result.error !== null);
    expect(refused?.error.code).toBe(HOUSEHOLD_FULL);
  });

  test("authenticated can no longer insert an invite directly — create_invite is the only way", async () => {
    const owner = await seeded("direct");

    const { data, error } = await owner.client
      .from("invites")
      .insert({ household_id: owner.householdId, created_by: owner.userId })
      .select()
      .single();

    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
    expect(await liveInviteCount(owner.householdId)).toBe(0);
  });
});
