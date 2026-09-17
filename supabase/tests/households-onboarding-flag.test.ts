// Integration test for households.onboarding_completed_at — the real write
// path GuidedOnboarding (src/components/guided-onboarding.tsx) uses to
// persist that the guided sequence has run its course for a household. NOT
// part of `npm run test` (see vitest.config.mts's exclude). Requires a
// running local Supabase stack with this migration applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// items-insert.test.ts for the same shortcut) if you've written one;
// otherwise export them yourself before running this.
//
// Covers this task's AC #4/#5 at the data layer: a brand-new household
// starts with onboarding_completed_at null (the "show onboarding" signal),
// a member can set it via the exact same plain UPDATE GuidedOnboarding
// issues (no RPC — households_member_access's existing RLS already covers
// this), and a non-member cannot.
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
  const email = `onboarding-flag-test-${label}-${randomUUID()}@example.com`;
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

describe("households.onboarding_completed_at", () => {
  let member: { userId: string; email: string; password: string };
  let outsider: { userId: string; email: string; password: string };
  let householdId: string;

  beforeAll(async () => {
    member = await createTestUser("member");
    outsider = await createTestUser("outsider");

    const { data: household, error: householdError } = await serviceClient
      .from("households")
      .insert({ name: "Onboarding flag test household" })
      .select()
      .single();
    if (householdError) {
      throw new Error(`failed to seed household: ${householdError.message}`);
    }
    householdId = household.id;

    const { error: memberError } = await serviceClient
      .from("household_members")
      .insert({ household_id: householdId, user_id: member.userId, role: "owner" });
    if (memberError) {
      throw new Error(`failed to seed membership: ${memberError.message}`);
    }
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().eq("id", householdId);
    await serviceClient.auth.admin.deleteUser(member.userId);
    await serviceClient.auth.admin.deleteUser(outsider.userId);
  });

  test("a brand-new household starts with onboarding_completed_at null", async () => {
    const { data, error } = await serviceClient
      .from("households")
      .select("onboarding_completed_at")
      .eq("id", householdId)
      .single();
    expect(error).toBeNull();
    expect(data?.onboarding_completed_at).toBeNull();
  });

  test("a member can set it via a plain UPDATE, the exact write GuidedOnboarding issues", async () => {
    const client = await signInAs(member.email, member.password);
    const now = new Date().toISOString();

    const { error } = await client.from("households").update({ onboarding_completed_at: now }).eq("id", householdId);
    expect(error).toBeNull();

    const { data: reread } = await serviceClient
      .from("households")
      .select("onboarding_completed_at")
      .eq("id", householdId)
      .single();
    // Postgres round-trips the timestamptz in "+00:00" form, not the
    // original "Z"-suffixed ISO string — compared by parsed value, not
    // exact string equality.
    const persisted = reread?.onboarding_completed_at ?? null;
    if (persisted === null) {
      throw new Error("expected onboarding_completed_at to be set");
    }
    expect(new Date(persisted).getTime()).toBe(new Date(now).getTime());
  });

  test("a caller who isn't a member of the household can't set it", async () => {
    // A separate household so this doesn't disturb the previous test's
    // already-set state, and so "no rows matched" is unambiguous.
    const { data: otherHousehold, error: otherHouseholdError } = await serviceClient
      .from("households")
      .insert({ name: "Onboarding flag test household (outsider target)" })
      .select()
      .single();
    if (otherHouseholdError) {
      throw new Error(`failed to seed second household: ${otherHouseholdError.message}`);
    }

    const outsiderClient = await signInAs(outsider.email, outsider.password);
    const { error } = await outsiderClient
      .from("households")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", otherHousehold.id);
    // RLS hides the row from a non-member entirely — the UPDATE matches
    // zero rows rather than erroring, same shape as any other RLS-scoped
    // write against a row the caller can't see.
    expect(error).toBeNull();

    const { data: reread } = await serviceClient
      .from("households")
      .select("onboarding_completed_at")
      .eq("id", otherHousehold.id)
      .single();
    expect(reread?.onboarding_completed_at).toBeNull();

    await serviceClient.from("households").delete().eq("id", otherHousehold.id);
  });
});
