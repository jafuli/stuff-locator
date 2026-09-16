// Integration test for the Invite-partner UI's real write path
// (src/app/settings/invite/page.tsx's insert-a-new-invite branch) — NOT
// part of `npm run test` (see vitest.config.mts's exclude). Requires a
// running local Supabase stack:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// invites-rls.test.ts for the same shortcut) if you've written one;
// otherwise export them yourself before running this.
//
// page.tsx is an async Server Component that imports "server-only" and
// can't be rendered via Vitest + RTL (same reasoning as the Home and Stash
// real-data-wiring tasks) — this proves the actual insert it performs
// (the exact shape src/app/settings/invite/page.tsx sends) lands correctly
// scoped, per AC #5. The reuse-vs-generate decision itself is a pure
// function (src/lib/invite-reuse.ts) unit-tested directly in
// src/__tests__/invite-reuse.test.ts; actual page rendering (the code,
// link, copy button, nav entry point) is covered by
// e2e/invite-partner.spec.ts against this same local stack.
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

interface SeededUser {
  householdId: string;
  userId: string;
  email: string;
  password: string;
}

async function seedHouseholdWithOwner(label: string): Promise<SeededUser> {
  const email = `invite-generate-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `Invite generate test household ${label}` })
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

describe("Invite-partner UI's generate-invite write path", () => {
  let householdA: SeededUser;
  let householdB: SeededUser;
  let clientA: SupabaseClient<Database>;
  const createdHouseholdIds: string[] = [];

  beforeAll(async () => {
    householdA = await seedHouseholdWithOwner("a");
    householdB = await seedHouseholdWithOwner("b");
    createdHouseholdIds.push(householdA.householdId, householdB.householdId);
    clientA = await signInAs(householdA.email, householdA.password);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", createdHouseholdIds);
    await serviceClient.auth.admin.deleteUser(householdA.userId);
    await serviceClient.auth.admin.deleteUser(householdB.userId);
  });

  test("a generated invite is scoped to the caller's own household, with a real unique code and created_by set", async () => {
    const { data, error } = await clientA
      .from("invites")
      .insert({ household_id: householdA.householdId, created_by: householdA.userId })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data?.household_id).toBe(householdA.householdId);
    expect(data?.created_by).toBe(householdA.userId);
    expect(data?.code).toBeTruthy();
    expect(data?.redeemed_at).toBeNull();

    // Real, queryable row — not just an echoed insert payload.
    const { data: reread } = await serviceClient.from("invites").select("id").eq("id", data?.id ?? "").single();
    expect(reread?.id).toBe(data?.id);
  });

  test("a caller cannot generate an invite scoped to a different household — rejected by RLS, not silently mis-scoped", async () => {
    const { data, error } = await clientA
      .from("invites")
      .insert({ household_id: householdB.householdId, created_by: householdA.userId })
      .select()
      .single();

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // insufficient_privilege — RLS WITH CHECK violation

    const { data: rows } = await serviceClient
      .from("invites")
      .select("id")
      .eq("household_id", householdB.householdId)
      .eq("created_by", householdA.userId);
    expect(rows).toHaveLength(0);
  });
});
