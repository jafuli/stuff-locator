// Integration test for the profiles table added by
// 20260927120000_profiles_and_display_names.sql — NOT part of `npm run
// test` (see vitest.config.mts's exclude). Requires a running local
// Supabase stack:
//
//   npm run supabase:start
//   npm run test:rls
//
// See browse-location-reads.test.ts's header for the env-var shortcut.
//
// A display name is the only piece of personal data in this schema, so
// the read rule is deliberately narrower than "any authenticated user":
// you can see people you actually share a household with, and no one
// else. That's what this file proves, along with the trigger that seeds
// a profile on sign-up in the first place.
import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run \`npm run supabase:start\` then \`npx supabase ` +
        "status -o env\`, and either export SUPABASE_URL/SUPABASE_ANON_KEY/" +
        "SUPABASE_SERVICE_ROLE_KEY yourself or write them to a gitignored " +
        ".env.rls.local so `npm run test:rls` loads them automatically.",
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const serviceClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

async function createTestUser(localPart: string): Promise<{ userId: string; email: string; password: string }> {
  const email = `${localPart}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    throw new Error(`failed to create test user "${localPart}": ${error.message}`);
  }
  return { userId: data.user.id, email, password };
}

async function createHouseholdWith(userIds: readonly string[]): Promise<string> {
  const { data, error } = await serviceClient
    .from("households")
    .insert({ name: `profiles-rls-${randomUUID()}` })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to create household: ${error.message}`);
  }
  for (const userId of userIds) {
    const { error: memberError } = await serviceClient
      .from("household_members")
      .insert({ household_id: data.id, user_id: userId, role: "owner" });
    if (memberError) {
      throw new Error(`failed to add member ${userId}: ${memberError.message}`);
    }
  }
  return data.id;
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

test("signing up seeds a profile whose display name is the email local-part", async () => {
  const { userId, email } = await createTestUser("profiles-seed");

  const { data, error } = await serviceClient
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  expect(error).toBeNull();
  // The trigger fires on the auth.users insert — no application code ran
  // here at all, only admin.createUser.
  expect(data?.display_name).toBe(email.split("@")[0]);
});

test("a household member can read their partner's display name", async () => {
  const me = await createTestUser("profiles-me");
  const partner = await createTestUser("profiles-partner");
  await createHouseholdWith([me.userId, partner.userId]);

  const myClient = await signInAs(me.email, me.password);
  const { data, error } = await myClient
    .from("profiles")
    .select("user_id, display_name")
    .eq("user_id", partner.userId)
    .maybeSingle();

  expect(error).toBeNull();
  expect(data?.display_name).toBe(partner.email.split("@")[0]);
});

test("a stranger's display name is invisible, even knowing their exact user id", async () => {
  const me = await createTestUser("profiles-insider");
  const stranger = await createTestUser("profiles-stranger");
  await createHouseholdWith([me.userId]);
  await createHouseholdWith([stranger.userId]);

  const myClient = await signInAs(me.email, me.password);
  const { data, error } = await myClient
    .from("profiles")
    .select("user_id, display_name")
    .eq("user_id", stranger.userId)
    .maybeSingle();

  // RLS filters the row out rather than erroring — "no row" is the
  // correct, non-leaky answer to a targeted lookup.
  expect(error).toBeNull();
  expect(data).toBeNull();
});

test("a user can always read their own profile", async () => {
  const me = await createTestUser("profiles-self");
  // Deliberately in no household at all — reading yourself must not
  // depend on membership.
  const myClient = await signInAs(me.email, me.password);

  const { data, error } = await myClient.from("profiles").select("display_name").eq("user_id", me.userId).maybeSingle();

  expect(error).toBeNull();
  expect(data?.display_name).toBe(me.email.split("@")[0]);
});

test("a user can rename themselves but not their partner", async () => {
  const me = await createTestUser("profiles-renamer");
  const partner = await createTestUser("profiles-renamed");
  await createHouseholdWith([me.userId, partner.userId]);

  const myClient = await signInAs(me.email, me.password);

  const { error: ownError } = await myClient
    .from("profiles")
    .update({ display_name: "Jane" })
    .eq("user_id", me.userId);
  expect(ownError).toBeNull();

  await myClient.from("profiles").update({ display_name: "Hacked" }).eq("user_id", partner.userId);

  // The write is filtered out by the UPDATE policy rather than rejected,
  // so the check that matters is the partner's row being untouched.
  const { data: partnerRow } = await serviceClient
    .from("profiles")
    .select("display_name")
    .eq("user_id", partner.userId)
    .maybeSingle();
  expect(partnerRow?.display_name).toBe(partner.email.split("@")[0]);

  const { data: myRow } = await serviceClient
    .from("profiles")
    .select("display_name")
    .eq("user_id", me.userId)
    .maybeSingle();
  expect(myRow?.display_name).toBe("Jane");
});

test("a profile cannot be forged for someone else", async () => {
  const me = await createTestUser("profiles-forger");
  const myClient = await signInAs(me.email, me.password);

  // No INSERT policy exists at all — rows come only from the trigger.
  const { error } = await myClient
    .from("profiles")
    .insert({ user_id: randomUUID(), display_name: "Impostor" });

  expect(error).not.toBeNull();
});
