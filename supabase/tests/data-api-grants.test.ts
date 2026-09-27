// Integration test proving the `anon` Data API role holds no table
// privileges at all — NOT part of `npm run test` (see vitest.config.mts's
// exclude). Requires a running local Supabase stack:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// Why this file exists: every other test in this directory drives the
// `authenticated` role, so nothing here would have noticed that anon held
// full SELECT/INSERT/UPDATE/DELETE on every table — which it did, via
// Supabase's default privileges, until
// 20260927140000_revoke_implicit_data_api_grants.sql. RLS still stopped
// anon (every policy is `to authenticated`), so the regression was
// invisible from the outside: an anon read came back empty either way.
//
// Hence the specific assertions below. A denial has two possible shapes and
// only one of them is a privilege check:
//
//   * no privilege  -> Postgres refuses the statement: 42501, "permission
//     denied for table x". Applies to SELECT, UPDATE and DELETE alike.
//   * privilege, no policy -> RLS decides instead. A SELECT returns an
//     empty array with no error; an UPDATE or DELETE matches zero rows and
//     comes back a success.
//
// So SELECT/UPDATE/DELETE erroring is the evidence, and it is evidence a
// plain "anon can't see anything" test cannot produce. INSERT is left out
// on purpose: an RLS WITH CHECK violation also raises 42501, so an insert
// failing proves nothing about privileges either way.
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Duplicated from the other integration test files rather than extracted —
// see create-household-rpc.test.ts's comment on why self-containment beats
// an abstraction at this file count.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run \`npm run supabase:start\` then \`npx supabase ` +
        "status -o env` to get API_URL/ANON_KEY/SERVICE_ROLE_KEY, and either " +
        "export them as SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY " +
        "yourself, or write them to a gitignored .env.rls.local so " +
        "`npm run test:rls` loads them automatically every time.",
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

// The anon key with no Authorization header — PostgREST runs the request as
// the `anon` role, which is what an unauthenticated visitor gets. The key is
// public by design (it ships in the browser bundle), so "what can anon do"
// is a real question about a real caller, not a hypothetical one.
const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);

const PERMISSION_DENIED = "42501";

describe("anon holds no privileges on the Data API tables", () => {
  // Reading is where the two denial shapes diverge most usefully: an
  // un-privileged SELECT errors, an un-policied one returns [].
  test.each([
    "households",
    "household_members",
    "locations",
    "items",
    "invites",
    "profiles",
  ] as const)("anon cannot select from %s", async (table) => {
    const { data, error } = await anonClient.from(table).select("*").limit(1);

    expect(data).toBeNull();
    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain(`permission denied for table ${table}`);
  });

  // UPDATE and DELETE on `items` stand in for all six tables: this is the
  // pair that silently succeeds when the privilege is present but no policy
  // matches, so an error here can only be the privilege check. The row id is
  // random and certainly absent — which is the point. Postgres rejects the
  // statement before it ever looks for rows, so a denial cannot be confused
  // with "nothing matched".
  test("anon cannot update a row, even a nonexistent one", async () => {
    const { error } = await anonClient
      .from("items")
      .update({ name: "anon was here" })
      .eq("id", randomUUID());

    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain("permission denied for table items");
  });

  test("anon cannot delete a row, even a nonexistent one", async () => {
    const { error } = await anonClient.from("items").delete().eq("id", randomUUID());

    expect(error?.code).toBe(PERMISSION_DENIED);
    expect(error?.message).toContain("permission denied for table items");
  });
});
