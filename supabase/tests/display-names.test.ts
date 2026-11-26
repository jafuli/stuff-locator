// Integration test for display names from sign-up
// (20261124124100_display_name_from_signup.sql). NOT part of `npm run test`
// — needs a running local Supabase stack; run with `npm run test:rls`.
//
// Proves, through real auth.users inserts (the Admin API, which fires the
// same trigger a sign-up does):
//   - the "Your name" sent as user metadata becomes the display name,
//     whitespace-normalised and clamped to 50
//   - missing, blank or non-string metadata falls back to the email handle,
//     and never fails the sign-up
//   - a person can rename themselves (display_name only), and a blank or
//     over-long name is refused by the CHECKs
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run \`npm run supabase:start\`, then write API_URL/ANON_KEY/SERVICE_ROLE_KEY ` +
        "to a gitignored .env.rls.local (see rls-household-isolation.test.ts) or export them yourself.",
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const serviceClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);
const PASSWORD = "a-long-enough-test-password-1!";
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const userId of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(userId);
  }
});

/** Signs a user up with the given metadata; returns their id, email handle and seeded display name. */
async function signUpWith(metadata: Record<string, unknown> | undefined) {
  const handle = `display-names-${randomUUID().slice(0, 8)}`;
  const email = `${handle}@example.com`;
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    ...(metadata === undefined ? {} : { user_metadata: metadata }),
  });
  expect(error).toBeNull();
  const userId = data.user?.id ?? "";
  createdUserIds.push(userId);

  const { data: profile } = await serviceClient.from("profiles").select("display_name").eq("user_id", userId).single();
  return { userId, email, handle, displayName: profile?.display_name };
}

async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    throw new Error(`failed to sign in as ${email}: ${error.message}`);
  }
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

describe("the display name comes from sign-up", () => {
  test("the metadata name is used, with whitespace normalised", async () => {
    const { displayName } = await signUpWith({ display_name: "  Noa \t  Levi\n" });
    expect(displayName).toBe("Noa Levi");
  });

  test("a name over 50 characters is clamped, not refused", async () => {
    const { displayName } = await signUpWith({ display_name: "x".repeat(70) });
    expect(displayName).toBe("x".repeat(50));
  });

  test.each([
    ["missing", undefined],
    ["blank", { display_name: "   " }],
    ["a number", { display_name: 42 }],
    ["an object", { display_name: { first: "Noa" } }],
    ["null", { display_name: null }],
  ])("%s metadata falls back to the email handle, and the sign-up still succeeds", async (_label, metadata) => {
    const { handle, displayName } = await signUpWith(metadata);
    expect(displayName).toBe(handle);
  });
});

describe("renaming yourself", () => {
  test("display_name can be changed; nothing else on the row can", async () => {
    const { userId, email } = await signUpWith({ display_name: "Noa" });
    const client = await signInAs(email);

    const rename = await client.from("profiles").update({ display_name: "Noa L." }).eq("user_id", userId);
    expect(rename.error).toBeNull();

    const other = await client
      .from("profiles")
      .update({ created_at: new Date(0).toISOString() })
      .eq("user_id", userId);
    expect(other.error?.code).toBe("42501");

    const { data } = await serviceClient.from("profiles").select("display_name").eq("user_id", userId).single();
    expect(data?.display_name).toBe("Noa L.");
  });

  test("a blank or over-long name is refused by the CHECKs", async () => {
    const { userId, email } = await signUpWith({ display_name: "Noa" });
    const client = await signInAs(email);

    const blank = await client.from("profiles").update({ display_name: "   " }).eq("user_id", userId);
    const tooLong = await client
      .from("profiles")
      .update({ display_name: "y".repeat(51) })
      .eq("user_id", userId);

    expect(blank.error?.code).toBe("23514");
    expect(tooLong.error?.code).toBe("23514");
  });
});
