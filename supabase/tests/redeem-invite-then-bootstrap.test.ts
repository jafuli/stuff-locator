// Integration test proving this task's central invariant: a fresh user
// redeeming a valid invite ends up in exactly the INVITER's household, not
// a bootstrap-created one in addition to it — the "critical interaction to
// get right" this task's own AC calls out explicitly. NOT part of
// `npm run test` (see vitest.config.mts's exclude). Requires a running
// local Supabase stack with every migration through
// 20260915100000_redeem_invite_rpc.sql applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// redeem-invite-rpc.test.ts for the same shortcut) if you've written one;
// otherwise export them yourself before running this.
//
// redeem_invite's own contract (double-redemption, expiry, concurrent
// races) is already covered in isolation by redeem-invite-rpc.test.ts —
// this file instead exercises the actual fix: calling `ensureHousehold`
// (the exact function /api/household/bootstrap calls) AFTER a real
// redemption, proving its own "does the user have zero households" read
// already finds the membership redeem_invite just created and correctly
// skips creating a second household — not a re-implementation of that
// logic, the real function.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ensureHousehold } from "@/server/services/household";

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
  const email = `redeem-then-bootstrap-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
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

describe("redeem_invite followed by ensureHousehold (the bootstrap-interaction fix)", () => {
  let inviterHouseholdId: string;
  let inviter: { userId: string; email: string; password: string };
  const createdUserIds: string[] = [];
  const createdHouseholdIds: string[] = [];

  beforeAll(async () => {
    inviter = await createTestUser("inviter");
    createdUserIds.push(inviter.userId);

    const { data: household, error: householdError } = await serviceClient
      .from("households")
      .insert({ name: "The inviter's real home" })
      .select()
      .single();
    if (householdError) {
      throw new Error(`failed to seed household: ${householdError.message}`);
    }
    inviterHouseholdId = household.id;
    createdHouseholdIds.push(inviterHouseholdId);

    const { error: memberError } = await serviceClient
      .from("household_members")
      .insert({ household_id: inviterHouseholdId, user_id: inviter.userId, role: "owner" });
    if (memberError) {
      throw new Error(`failed to seed owner membership: ${memberError.message}`);
    }
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", createdHouseholdIds);
    for (const userId of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(userId);
    }
  });

  async function createInvite(): Promise<string> {
    const { data, error } = await serviceClient
      .from("invites")
      .insert({ household_id: inviterHouseholdId, created_by: inviter.userId })
      .select("code")
      .single();
    if (error) {
      throw new Error(`failed to seed invite: ${error.message}`);
    }
    return data.code;
  }

  test("a fresh user who redeems before bootstrapping ends up in exactly one household — the inviter's", async () => {
    const joiner = await createTestUser("joiner-redeem-first");
    createdUserIds.push(joiner.userId);
    const code = await createInvite();
    const joinerClient = await signInAs(joiner.email, joiner.password);

    // Step 1: redeem, exactly as SignUpForm/SignInForm's `invite` prop does
    // before ever calling triggerHouseholdBootstrap.
    const { error: redeemError } = await joinerClient.rpc("redeem_invite", { p_code: code });
    expect(redeemError).toBeNull();

    // Step 2: the real bootstrap check — the exact function
    // /api/household/bootstrap calls. If the ordering fix works, this
    // finds the membership redemption just created and returns
    // created: false, never invoking create_household.
    const result = await ensureHousehold(joinerClient, joiner.userId, joiner.email);
    expect(result).toEqual({ ok: true, created: false });

    // Exactly one household — the inviter's, not a second bootstrap-created
    // one — confirmed by reading it back through the joiner's own client.
    const { data: memberships, error: membershipsError } = await joinerClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", joiner.userId);
    expect(membershipsError).toBeNull();
    expect(memberships).toHaveLength(1);
    expect(memberships?.[0]?.household_id).toBe(inviterHouseholdId);
  });

  test("contrast case: bootstrapping BEFORE redeeming (the bug this fix avoids) would leave the user in two households", async () => {
    const joiner = await createTestUser("joiner-bootstrap-first");
    createdUserIds.push(joiner.userId);
    const code = await createInvite();
    const joinerClient = await signInAs(joiner.email, joiner.password);

    // Deliberately the WRONG order, to prove the two-household outcome
    // this task's AC explicitly warns against is real if the ordering
    // isn't respected — not exercised anywhere in the actual app code
    // (SignUpForm/SignInForm always redeem first), but this is what makes
    // "redeem before bootstrap" a genuine fix rather than a defensive
    // no-op.
    const bootstrapResult = await ensureHousehold(joinerClient, joiner.userId, joiner.email);
    expect(bootstrapResult).toEqual({ ok: true, created: true });

    const { error: redeemError } = await joinerClient.rpc("redeem_invite", { p_code: code });
    expect(redeemError).toBeNull();

    const { data: memberships } = await joinerClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", joiner.userId);
    expect(memberships).toHaveLength(2);
    const householdIds = (memberships ?? []).map((row) => row.household_id);
    expect(householdIds).toContain(inviterHouseholdId);

    // Clean up the extra bootstrap-created household this deliberately-
    // wrong-order case produced, so it doesn't leak between test runs.
    const extraHouseholdId = householdIds.find((id) => id !== inviterHouseholdId);
    if (extraHouseholdId) {
      createdHouseholdIds.push(extraHouseholdId);
    }
  });
});
