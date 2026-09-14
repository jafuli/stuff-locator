// Integration test proving the invites table's RLS actually isolates
// households — NOT part of `npm run test` (see vitest.config.mts's
// exclude). Requires a running local Supabase stack with this migration
// applied:
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
// This is a schema-only task — there is no redeem_invite RPC yet, so every
// call here goes straight through PostgREST against the `invites` table,
// not `.rpc()`. Covers:
//   - a member of household A can INSERT and SELECT an invite row scoped
//     to household A
//   - a member of household A is DENIED — with real evidence of denial,
//     not just an empty/error result that could also mean something else —
//     both inserting and selecting an invite row scoped to household B
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Duplicated from the other integration test files rather than extracted —
// see create-household-rpc.test.ts's comment on why self-containment beats
// a two-use (now three-use) abstraction at this file count.
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

interface SeededHousehold {
  householdId: string;
  userId: string;
  email: string;
  password: string;
}

async function seedHouseholdWithOwner(label: string): Promise<SeededHousehold> {
  const email = `invites-rls-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `Invites RLS test household ${label}` })
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

describe("invites RLS", () => {
  let householdA: SeededHousehold;
  let householdB: SeededHousehold;
  let clientA: SupabaseClient<Database>;
  const createdInviteIds: string[] = [];

  beforeAll(async () => {
    householdA = await seedHouseholdWithOwner("a");
    householdB = await seedHouseholdWithOwner("b");
    clientA = await signInAs(householdA.email, householdA.password);
  }, 30_000);

  afterAll(async () => {
    // Deleting the households cascades to their invites (ON DELETE CASCADE);
    // deleting the users cascades to household_members.
    await serviceClient
      .from("households")
      .delete()
      .in("id", [householdA.householdId, householdB.householdId]);
    await serviceClient.auth.admin.deleteUser(householdA.userId);
    await serviceClient.auth.admin.deleteUser(householdB.userId);
  });

  test("a member can insert and select an invite scoped to their own household", async () => {
    const { data, error } = await clientA
      .from("invites")
      .insert({ household_id: householdA.householdId, created_by: householdA.userId })
      .select()
      .single();
    expect(error).toBeNull();
    const invite = assertNotNull(data, "invites insert returned no data");
    expect(invite.household_id).toBe(householdA.householdId);
    expect(invite.created_by).toBe(householdA.userId);
    expect(invite.code).toBeTruthy(); // the gen_random_bytes() default fired
    expect(invite.redeemed_at).toBeNull();
    createdInviteIds.push(invite.id);

    const { data: selected, error: selectError } = await clientA
      .from("invites")
      .select("*")
      .eq("id", invite.id)
      .single();
    expect(selectError).toBeNull();
    expect(selected?.id).toBe(invite.id);
  });

  test("a member is denied inserting an invite scoped to a different household — a real error, not a silent no-op", async () => {
    const { data, error } = await clientA
      .from("invites")
      .insert({ household_id: householdB.householdId, created_by: householdA.userId })
      .select()
      .single();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // insufficient_privilege — RLS WITH CHECK violation

    const { data: rows, error: checkError } = await serviceClient
      .from("invites")
      .select("id")
      .eq("household_id", householdB.householdId)
      .eq("created_by", householdA.userId);
    expect(checkError).toBeNull();
    expect(rows).toHaveLength(0);
  });

  test("a member is denied reading household B's invite rows — not just an empty result", async () => {
    const { data: seeded, error: seedError } = await serviceClient
      .from("invites")
      .insert({ household_id: householdB.householdId, created_by: householdB.userId })
      .select()
      .single();
    expect(seedError).toBeNull();
    const bInvite = assertNotNull(seeded, "failed to seed household B's invite via service role");

    // Positive control: prove via the service role (bypasses RLS) that this
    // row genuinely exists, so household A getting nothing back below is
    // provably RLS omission, not a nonexistent-row false negative.
    const { data: control } = await serviceClient
      .from("invites")
      .select("id")
      .eq("id", bInvite.id)
      .single();
    expect(control).not.toBeNull();

    const { data: asA, error: asAError } = await clientA
      .from("invites")
      .select("*")
      .eq("id", bInvite.id);
    expect(asAError).toBeNull();
    expect(asA).toHaveLength(0);
  });

  test("members have no UPDATE or DELETE grant at all — rejected before RLS even applies", async () => {
    const invite = assertNotNull(
      createdInviteIds[0],
      "expected an earlier test to have created household A's invite",
    );

    // `authenticated` was never GRANTed UPDATE/DELETE on this table (not
    // merely un-policied), so Postgres refuses the statement outright with
    // permission-denied — the same shape of rejection the anon-key caller
    // gets in create-household-rpc.test.ts, here applied to a member acting
    // on their own household's own row.
    const { error: updateError } = await clientA
      .from("invites")
      .update({ redeemed_at: new Date().toISOString() })
      .eq("id", invite);
    expect(updateError).not.toBeNull();
    expect(updateError?.code).toBe("42501");

    const { data: stillThere } = await serviceClient
      .from("invites")
      .select("redeemed_at")
      .eq("id", invite)
      .single();
    expect(stillThere?.redeemed_at).toBeNull();

    const { error: deleteError } = await clientA.from("invites").delete().eq("id", invite);
    expect(deleteError).not.toBeNull();
    expect(deleteError?.code).toBe("42501");

    const { data: stillExists } = await serviceClient
      .from("invites")
      .select("id")
      .eq("id", invite)
      .single();
    expect(stillExists?.id).toBe(invite);
  });
});
