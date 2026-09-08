// Integration test proving the create_household RPC's guarantees — NOT
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
//   - a signed-in user can create a household and read back both the
//     household row and their own owner membership row through their OWN
//     client (proving RLS now recognizes them as a member — not just that
//     the RPC returned data)
//   - empty/whitespace-only names are rejected with no row ever created,
//     checked by row existence, not just the caught error
//   - an unauthenticated (anon-key, no session) caller is rejected by the
//     GRANT itself, before the function body ever runs
//   - calling twice as the same user succeeds both times with two
//     independent households (multi-household membership is supported)
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Duplicated from rls-household-isolation.test.ts rather than extracted to
// a shared helpers module — with only two integration test files, keeping
// each one fully self-contained (open it, understand the whole setup,
// don't chase an import) beats a two-use abstraction. Revisit if a third
// integration test file needs the same sign-in flow.
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

// Narrows a nullable RPC/query result without a non-null assertion (banned
// by this repo's DoD) — fails the test with a clear message rather than
// silently continuing with `null` if a "success" call didn't actually
// return data.
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
  // A fresh client carrying the user's own JWT — this is what makes
  // auth.uid() resolve to this user both in RLS policies and inside
  // create_household itself.
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

describe("create_household RPC", () => {
  const email = `create-household-test-${randomUUID()}@example.com`;
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
    // Deleting the households cascades to their household_members rows;
    // deleting the user is a second, independent path to the same rows
    // (household_members.user_id also references auth.users).
    if (createdHouseholdIds.length > 0) {
      await serviceClient.from("households").delete().in("id", createdHouseholdIds);
    }
    await serviceClient.auth.admin.deleteUser(userId);
  });

  test("creates a household and its owner membership, readable through the caller's own client", async () => {
    const { data, error } = await userClient.rpc("create_household", {
      p_name: "  The Home  ",
    });
    expect(error).toBeNull();
    const household = assertNotNull(data, "create_household returned no data");
    expect(household.name).toBe("The Home"); // trimmed
    expect(household.id).toBeTruthy();
    expect(household.created_at).toBeTruthy();
    createdHouseholdIds.push(household.id);

    // Read back as the SAME user's own (RLS-gated) client, not the service
    // client — proof that is_household_member() now returns true for this
    // household, i.e. the RPC's second insert actually committed and RLS
    // recognizes it, not just that the RPC returned data.
    const { data: membership, error: membershipError } = await userClient
      .from("household_members")
      .select("*")
      .eq("household_id", household.id)
      .eq("user_id", userId)
      .single();
    expect(membershipError).toBeNull();
    expect(membership?.role).toBe("owner");
    expect(membership?.joined_at).toBeTruthy();
  });

  test("rejects an empty or whitespace-only name and creates no row", async () => {
    const { error: emptyError } = await userClient.rpc("create_household", { p_name: "" });
    expect(emptyError).not.toBeNull();
    expect(emptyError?.message).toMatch(/create_household:.*empty/i);

    const whitespaceName = "   \t  ";
    const { error: whitespaceError } = await userClient.rpc("create_household", {
      p_name: whitespaceName,
    });
    expect(whitespaceError).not.toBeNull();
    expect(whitespaceError?.message).toMatch(/create_household:.*empty/i);

    // Row-count assertions, not just the caught errors — check both the
    // exact bad values a swallowed validation bug could plausibly have
    // inserted: trimmed to '', or left untrimmed.
    const { data: emptyRows, error: emptyCheckError } = await serviceClient
      .from("households")
      .select("id")
      .eq("name", "");
    expect(emptyCheckError).toBeNull();
    expect(emptyRows).toHaveLength(0);

    const { data: whitespaceRows, error: whitespaceCheckError } = await serviceClient
      .from("households")
      .select("id")
      .eq("name", whitespaceName);
    expect(whitespaceCheckError).toBeNull();
    expect(whitespaceRows).toHaveLength(0);
  });

  test("rejects an unauthenticated (anon-key, no session) caller and creates no row", async () => {
    const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
    const anonName = `anon-should-not-exist-${randomUUID()}`;

    const { data, error } = await anonClient.rpc("create_household", { p_name: anonName });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    // The `authenticated`-only GRANT means Postgres itself refuses the
    // call (permission denied for function) before create_household's own
    // body — including its `auth.uid() is null` defense-in-depth check —
    // ever runs; that internal check only matters if the GRANT is ever
    // loosened. (Exercising that internal branch directly would require
    // hand-crafting a JWT with role: authenticated and no sub claim, which
    // isn't worth the complexity for a defense-in-depth line — a known,
    // documented gap, not a masked one.)
    expect(error?.code).toBe("42501");

    const { data: rows, error: checkError } = await serviceClient
      .from("households")
      .select("id")
      .eq("name", anonName);
    expect(checkError).toBeNull();
    expect(rows).toHaveLength(0);
  });

  test("supports multi-household membership: calling twice as the same user succeeds both times", async () => {
    const { data: firstData, error: firstError } = await userClient.rpc("create_household", {
      p_name: "First Household",
    });
    expect(firstError).toBeNull();
    const first = assertNotNull(firstData, "create_household returned no data (first call)");
    createdHouseholdIds.push(first.id);

    const { data: secondData, error: secondError } = await userClient.rpc("create_household", {
      p_name: "Second Household",
    });
    expect(secondError).toBeNull();
    const second = assertNotNull(secondData, "create_household returned no data (second call)");
    createdHouseholdIds.push(second.id);

    expect(first.id).not.toBe(second.id);

    const { data: memberships, error: membershipsError } = await userClient
      .from("household_members")
      .select("*")
      .in("household_id", [first.id, second.id])
      .eq("user_id", userId);
    expect(membershipsError).toBeNull();
    expect(memberships).toHaveLength(2);
    for (const membership of memberships ?? []) {
      expect(membership.role).toBe("owner");
    }
  });
});
