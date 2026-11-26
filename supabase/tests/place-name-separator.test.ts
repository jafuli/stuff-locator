// Integration test for the path-separator CHECK
// (20261124160852_no_path_separator_in_place_names.sql). NOT part of
// `npm run test` — needs a running local Supabase stack; run with
// `npm run test:rls`.
//
// "›" joins a path's names in location_path_text and the activity_events
// snapshots, and the feed splits on it, so no writer may store it in a
// place name.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
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

const CHECK_VIOLATION = "23514";
const PASSWORD = "a-long-enough-test-password-1!";

let userId: string;
let householdId: string;
let placeId: string;
let itemId: string;
let client: SupabaseClient<Database>;

beforeAll(async () => {
  const email = `separator-test-${randomUUID()}@example.com`;
  const { data: user, error } = await serviceClient.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) {
    throw new Error(error.message);
  }
  userId = user.user.id;

  const anon = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) {
    throw new Error(signInError.message);
  }
  client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  const { data: household, error: householdError } = await client.rpc("create_household", { p_name: "Separator test" });
  if (householdError) {
    throw new Error(householdError.message);
  }
  householdId = household.id;

  const { data: item, error: stashError } = await client.rpc("stash_item", { p_name: "Keys", p_new_path: ["Garage"] });
  if (stashError) {
    throw new Error(stashError.message);
  }
  itemId = item.id;
  placeId = item.location_id;
}, 30_000);

afterAll(async () => {
  await serviceClient.from("items").delete().eq("household_id", householdId);
  await serviceClient.from("households").delete().eq("id", householdId);
  await serviceClient.auth.admin.deleteUser(userId);
});

function expectSeparatorRefusal(error: { code: string; message: string } | null) {
  expect(error?.code).toBe(CHECK_VIOLATION);
  expect(error?.message).toContain("locations_name_no_path_separator");
}

test("create_location refuses a name with '›'", async () => {
  const { error } = await client.rpc("create_location", { p_name: "Shelf › Box" });
  expectSeparatorRefusal(error);
});

test("rename_location refuses it", async () => {
  const { error } = await client.rpc("rename_location", { p_location_id: placeId, p_name: "Garage › Loft" });
  expectSeparatorRefusal(error);
});

test("a new path level in stash_item and move_item refuses it", async () => {
  const stash = await client.rpc("stash_item", { p_name: "Tent", p_new_path: ["Loft › Crate"] });
  const move = await client.rpc("move_item", { p_item_id: itemId, p_new_path: ["Shed", "Bag › Pouch"] });
  expectSeparatorRefusal(stash.error);
  expectSeparatorRefusal(move.error);
});

test("the plain '>' is still fine", async () => {
  const { error } = await client.rpc("create_location", { p_name: "Shelf > Box" });
  expect(error).toBeNull();
});
