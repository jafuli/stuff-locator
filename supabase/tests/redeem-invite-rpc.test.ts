// Integration test proving the redeem_invite RPC's full contract — NOT
// part of `npm run test` (see vitest.config.mts's exclude). Requires a
// running local Supabase stack with this migration applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// create-household-rpc.test.ts for the same shortcut) if you've written
// one; otherwise export them yourself before running this.
//
// Covers this task's AC #4 (a)-(e) plus the two things its own AC calls
// out for special attention:
//   - GRANT EXECUTE is scoped to `authenticated` only (an anon-key caller
//     is rejected by the grant itself, before the function body runs)
//   - the concurrent-redemption defense (two simultaneous calls for the
//     same code) actually works: exactly one succeeds
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
  const email = `redeem-invite-test-${label}-${randomUUID()}@example.com`;
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

async function createInvite(householdId: string, createdBy: string, expiresAt?: string): Promise<{ id: string; code: string }> {
  const { data, error } = await serviceClient
    .from("invites")
    .insert({ household_id: householdId, created_by: createdBy, expires_at: expiresAt ?? null })
    .select("id, code")
    .single();
  if (error) {
    throw new Error(`failed to seed invite: ${error.message}`);
  }
  return data;
}

describe("redeem_invite RPC", () => {
  let owner: { userId: string; email: string; password: string };
  let householdId: string;
  const createdUserIds: string[] = [];
  const createdHouseholdIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser("owner");
    createdUserIds.push(owner.userId);

    const { data: household, error: householdError } = await serviceClient
      .from("households")
      .insert({ name: "Redeem invite test household" })
      .select()
      .single();
    if (householdError) {
      throw new Error(`failed to seed household: ${householdError.message}`);
    }
    householdId = household.id;
    createdHouseholdIds.push(householdId);

    const { error: memberError } = await serviceClient
      .from("household_members")
      .insert({ household_id: householdId, user_id: owner.userId, role: "owner" });
    if (memberError) {
      throw new Error(`failed to seed owner membership: ${memberError.message}`);
    }
  }, 30_000);

  afterAll(async () => {
    // Deleting the households cascades to their invites and
    // household_members rows.
    await serviceClient.from("households").delete().in("id", createdHouseholdIds);
    for (const userId of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(userId);
    }
  });

  test("a valid invite lets a different user join, marks the invite redeemed, and leaves the owner's own membership untouched", async () => {
    const redeemer = await createTestUser("redeemer-a");
    createdUserIds.push(redeemer.userId);
    const invite = await createInvite(householdId, owner.userId);

    const redeemerClient = await signInAs(redeemer.email, redeemer.password);
    const { data, error } = await redeemerClient.rpc("redeem_invite", { p_code: invite.code });

    expect(error).toBeNull();
    const result = assertNotNull(data, "redeem_invite returned no data");
    expect(result.id).toBe(invite.id);
    expect(result.redeemed_by).toBe(redeemer.userId);
    expect(result.redeemed_at).toBeTruthy();

    // Readable through the redeemer's OWN client — proof is_household_member
    // now recognizes them, not just that the RPC returned success.
    const { data: membership, error: membershipError } = await redeemerClient
      .from("household_members")
      .select("role, joined_at")
      .eq("household_id", householdId)
      .eq("user_id", redeemer.userId)
      .single();
    expect(membershipError).toBeNull();
    expect(membership?.role).toBe("member"); // default role, never 'owner' via redemption

    // AC (e): the household's existing members/roles are never affected —
    // the owner's own row is exactly as it was.
    const { data: ownerMembership } = await serviceClient
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", owner.userId)
      .single();
    expect(ownerMembership?.role).toBe("owner");
  });

  test("redeeming an already-redeemed code is rejected outright, and creates no new membership", async () => {
    const firstRedeemer = await createTestUser("already-redeemed-first");
    const secondRedeemer = await createTestUser("already-redeemed-second");
    createdUserIds.push(firstRedeemer.userId, secondRedeemer.userId);
    const invite = await createInvite(householdId, owner.userId);

    const firstClient = await signInAs(firstRedeemer.email, firstRedeemer.password);
    const { error: firstError } = await firstClient.rpc("redeem_invite", { p_code: invite.code });
    expect(firstError).toBeNull();

    const secondClient = await signInAs(secondRedeemer.email, secondRedeemer.password);
    const { data, error } = await secondClient.rpc("redeem_invite", { p_code: invite.code });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/already redeemed/);

    const { data: rows } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("user_id", secondRedeemer.userId);
    expect(rows).toHaveLength(0);
  });

  test("an already-member caller redeeming a still-valid code succeeds idempotently — no duplicate row, invite still consumed", async () => {
    const alreadyMember = await createTestUser("already-member");
    createdUserIds.push(alreadyMember.userId);

    // Seeded as a member directly (not via a prior redemption) — this is
    // the "joined some other way before using this code" case AC #1 names.
    const { error: preMembershipError } = await serviceClient
      .from("household_members")
      .insert({ household_id: householdId, user_id: alreadyMember.userId, role: "member" });
    if (preMembershipError) {
      throw new Error(`failed to pre-seed membership: ${preMembershipError.message}`);
    }
    const { data: before } = await serviceClient
      .from("household_members")
      .select("joined_at")
      .eq("household_id", householdId)
      .eq("user_id", alreadyMember.userId)
      .single();

    const invite = await createInvite(householdId, owner.userId);
    const client = await signInAs(alreadyMember.email, alreadyMember.password);
    const { data, error } = await client.rpc("redeem_invite", { p_code: invite.code });

    expect(error).toBeNull();
    expect(data?.redeemed_by).toBe(alreadyMember.userId);
    expect(data?.redeemed_at).toBeTruthy();

    const { data: rows } = await serviceClient
      .from("household_members")
      .select("joined_at")
      .eq("household_id", householdId)
      .eq("user_id", alreadyMember.userId);
    expect(rows).toHaveLength(1); // no duplicate row
    expect(rows?.[0]?.joined_at).toBe(before?.joined_at); // no re-insert
  });

  test("an expired invite is rejected and creates no membership", async () => {
    const redeemer = await createTestUser("expired");
    createdUserIds.push(redeemer.userId);
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const invite = await createInvite(householdId, owner.userId, pastDate);

    const client = await signInAs(redeemer.email, redeemer.password);
    const { data, error } = await client.rpc("redeem_invite", { p_code: invite.code });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/expired/);

    const { data: rows } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("user_id", redeemer.userId);
    expect(rows).toHaveLength(0);

    const { data: inviteRow } = await serviceClient.from("invites").select("redeemed_at").eq("id", invite.id).single();
    expect(inviteRow?.redeemed_at).toBeNull();
  });

  test("a nonexistent code is rejected clearly", async () => {
    const redeemer = await createTestUser("bogus-code");
    createdUserIds.push(redeemer.userId);
    const client = await signInAs(redeemer.email, redeemer.password);

    const { data, error } = await client.rpc("redeem_invite", { p_code: "this-code-does-not-exist" });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not found/);
  });

  test("an unauthenticated (anon-key, no session) caller is rejected by the GRANT itself", async () => {
    const invite = await createInvite(householdId, owner.userId);
    const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);

    const { data, error } = await anonClient.rpc("redeem_invite", { p_code: invite.code });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // Same shape as create-household-rpc.test.ts's equivalent case: the
    // `authenticated`-only GRANT means Postgres refuses the call outright
    // (permission denied for function) before redeem_invite's own body —
    // including its `auth.uid() is null` defense-in-depth check — ever runs.
    expect(error?.code).toBe("42501");

    const { data: inviteRow } = await serviceClient.from("invites").select("redeemed_at").eq("id", invite.id).single();
    expect(inviteRow?.redeemed_at).toBeNull();
  });

  test("two concurrent redemptions of the same code: exactly one succeeds, and only one membership row is created", async () => {
    const first = await createTestUser("concurrent-a");
    const second = await createTestUser("concurrent-b");
    createdUserIds.push(first.userId, second.userId);
    const invite = await createInvite(householdId, owner.userId);

    const [firstClient, secondClient] = await Promise.all([
      signInAs(first.email, first.password),
      signInAs(second.email, second.password),
    ]);

    const [firstResult, secondResult] = await Promise.all([
      firstClient.rpc("redeem_invite", { p_code: invite.code }),
      secondClient.rpc("redeem_invite", { p_code: invite.code }),
    ]);

    const results = [firstResult, secondResult];
    const succeeded = results.filter((result) => result.error === null);
    const failed = results.filter((result) => result.error !== null);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.error?.message).toMatch(/already redeemed|redeemed concurrently/);

    const { data: rows } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .in("user_id", [first.userId, second.userId]);
    expect(rows).toHaveLength(1);
  });

  test("the SAME user concurrently redeeming the same code twice gets a clean rejection, not a raw unique-violation", async () => {
    // Distinct from the cross-user race above: both calls here share a
    // user_id, so the household_members INSERT's own ON CONFLICT
    // (household_id, user_id) is what's actually being exercised — a
    // plain "if not exists then insert" (this function's earlier,
    // now-fixed shape) has a TOCTOU race here that a cross-user race
    // never reaches, since two different users can't collide on that PK.
    const user = await createTestUser("self-race-same-code");
    createdUserIds.push(user.userId);
    const invite = await createInvite(householdId, owner.userId);
    const client = await signInAs(user.email, user.password);

    const [first, second] = await Promise.all([
      client.rpc("redeem_invite", { p_code: invite.code }),
      client.rpc("redeem_invite", { p_code: invite.code }),
    ]);

    const results = [first, second];
    const succeeded = results.filter((result) => result.error === null);
    const failed = results.filter((result) => result.error !== null);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    // The bug this test guards against: without ON CONFLICT DO NOTHING,
    // the loser surfaces a raw Postgres 23505 (unique_violation) instead
    // of this function's own clean exception.
    expect(failed[0]?.error?.code).not.toBe("23505");
    expect(failed[0]?.error?.message).toMatch(/already redeemed|redeemed concurrently/);

    const { data: rows } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("user_id", user.userId);
    expect(rows).toHaveLength(1);
  });

  test("the SAME user concurrently redeeming two DIFFERENT still-valid codes for the same household: both succeed, one membership row", async () => {
    // The other half of the same TOCTOU race: here both invites are
    // genuinely valid and distinct, so both UPDATEs on `invites` target
    // different rows and should both succeed — the only shared resource
    // is the household_members row, which ON CONFLICT DO NOTHING must
    // resolve without aborting either transaction.
    const user = await createTestUser("self-race-two-codes");
    createdUserIds.push(user.userId);
    const inviteA = await createInvite(householdId, owner.userId);
    const inviteB = await createInvite(householdId, owner.userId);
    const client = await signInAs(user.email, user.password);

    const [resultA, resultB] = await Promise.all([
      client.rpc("redeem_invite", { p_code: inviteA.code }),
      client.rpc("redeem_invite", { p_code: inviteB.code }),
    ]);

    expect(resultA.error).toBeNull();
    expect(resultB.error).toBeNull();

    const { data: invites } = await serviceClient
      .from("invites")
      .select("id, redeemed_by")
      .in("id", [inviteA.id, inviteB.id]);
    expect(invites).toHaveLength(2);
    for (const invite of invites ?? []) {
      expect(invite.redeemed_by).toBe(user.userId);
    }

    const { data: rows } = await serviceClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("user_id", user.userId);
    expect(rows).toHaveLength(1); // not two — the second insert was a no-op
  });
});
