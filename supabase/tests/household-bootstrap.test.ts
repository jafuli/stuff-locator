// Integration test for the household-bootstrap service function
// (src/server/services/household.ts's ensureHousehold) — NOT part of
// `npm run test` (see vitest.config.mts's exclude). Requires a running
// local Supabase stack with the create_household migration applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// This exercises the REAL ensureHousehold (not a reimplementation of its
// logic) against a real Postgres/PostgREST stack, proving the actual
// acceptance criteria for household bootstrap:
//   - a fresh authenticated user with no household ends up with exactly
//     one after ensureHousehold runs
//   - running ensureHousehold again for that same now-has-a-household user
//     does not create a second one (create_household itself is NOT
//     idempotent — this membership check is the only thing preventing a
//     duplicate on a repeat call, see the RPC's own migration)
//   - an unauthenticated (anon-key, no session) call is rejected and
//     creates nothing
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { ensureHousehold } from "@/server/services/household";

// Duplicated from create-household-rpc.test.ts / rls-household-isolation.test.ts
// rather than extracted — see those files' own comments on why, with only
// a few integration test files, self-containment beats a shared helpers
// module.
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

describe("ensureHousehold", () => {
  const email = `household-bootstrap-test-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  let userId: string;
  let userClient: SupabaseClient<Database>;
  const createdHouseholdIds: string[] = [];

  beforeAll(async () => {
    const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError) {
      throw new Error(`failed to create test user: ${userError.message}`);
    }
    userId = userData.user.id;
    userClient = await signInAs(email, password);
  }, 30_000);

  afterAll(async () => {
    if (createdHouseholdIds.length > 0) {
      await serviceClient.from("households").delete().in("id", createdHouseholdIds);
    }
    await serviceClient.auth.admin.deleteUser(userId);
  });

  test("a fresh user with no household ends up with exactly one", async () => {
    const result = await ensureHousehold(userClient, userId, email);
    expect(result).toEqual({ ok: true, created: true });

    const { data: memberships, error } = await userClient
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", userId);
    expect(error).toBeNull();
    expect(memberships).toHaveLength(1);
    expect(memberships?.[0]?.role).toBe("owner");
    const membership = assertNotNull(memberships?.[0] ?? null, "expected exactly one membership row");
    createdHouseholdIds.push(membership.household_id);
  });

  test("running it again for the same user does not create a second household", async () => {
    const result = await ensureHousehold(userClient, userId, email);
    expect(result).toEqual({ ok: true, created: false });

    const { data: memberships, error } = await userClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId);
    expect(error).toBeNull();
    expect(memberships).toHaveLength(1);
  });

  test("an unauthenticated call is rejected and creates nothing", async () => {
    const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
    const anonEmail = `anon-household-bootstrap-${randomUUID()}@example.com`;

    const result = await ensureHousehold(anonClient, randomUUID(), anonEmail);
    expect(result.ok).toBe(false);

    // The derived household name (anon-household-bootstrap-<uuid> local
    // part) is unique per run — confirming no row with that name exists
    // proves the RPC never ran, not just that ensureHousehold reported
    // failure.
    const derivedName = anonEmail.split("@")[0];
    const { data: rows, error } = await serviceClient.from("households").select("id").eq("name", derivedName);
    expect(error).toBeNull();
    expect(rows).toHaveLength(0);
  });
});
