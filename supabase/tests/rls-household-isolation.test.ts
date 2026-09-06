// Integration test proving RLS actually isolates households — NOT part of
// `npm run test` (see vitest.config.mts's exclude). Requires a running local
// Supabase stack:
//
//   npm run supabase:start
//   export SUPABASE_URL=http://127.0.0.1:54321       # API_URL from the start output
//   export SUPABASE_ANON_KEY=<ANON_KEY from the start output>
//   export SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from the start output>
//   npm run test:rls
//
// Seeds two households with one member each (via the service-role client,
// which bypasses RLS — normal for test setup), then proves:
//   - a member can read/write their own household's locations/items
//   - a member is denied on the other household's rows, with real evidence
//     of denial (not just an empty array that could also mean "not found")
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Run \`npm run supabase:start\` and export the printed ` +
        "API_URL/ANON_KEY/SERVICE_ROLE_KEY as SUPABASE_URL/SUPABASE_ANON_KEY/" +
        "SUPABASE_SERVICE_ROLE_KEY before `npm run test:rls`.",
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const serviceClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

interface SeededHousehold {
  householdId: string;
  userId: string;
  email: string;
  password: string;
  locationId: string;
  itemId: string;
}

async function seedHousehold(label: string): Promise<SeededHousehold> {
  const email = `rls-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `RLS test household ${label}` })
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

  const { data: location, error: locationError } = await serviceClient
    .from("locations")
    .insert({ household_id: household.id, name: `Room ${label}` })
    .select()
    .single();
  if (locationError) {
    throw new Error(`failed to seed location for "${label}": ${locationError.message}`);
  }

  const { data: item, error: itemError } = await serviceClient
    .from("items")
    .insert({
      household_id: household.id,
      location_id: location.id,
      name: `Item ${label}`,
      added_by: userData.user.id,
    })
    .select()
    .single();
  if (itemError) {
    throw new Error(`failed to seed item for "${label}": ${itemError.message}`);
  }

  return {
    householdId: household.id,
    userId: userData.user.id,
    email,
    password,
    locationId: location.id,
    itemId: item.id,
  };
}

async function signInAs(email: string, password: string): Promise<SupabaseClient<Database>> {
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`failed to sign in as ${email}: ${error.message}`);
  }
  // A fresh client carrying the member's own JWT — this is what makes
  // auth.uid() resolve to this user inside RLS policies, as opposed to the
  // service-role client above which bypasses RLS entirely.
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

describe("RLS household isolation", () => {
  let householdA: SeededHousehold;
  let householdB: SeededHousehold;
  let clientA: SupabaseClient<Database>;

  beforeAll(async () => {
    householdA = await seedHousehold("a");
    householdB = await seedHousehold("b");
    clientA = await signInAs(householdA.email, householdA.password);
  }, 30_000);

  afterAll(async () => {
    // Deleting the households cascades to their locations/items;
    // deleting the users cascades to household_members.
    await serviceClient
      .from("households")
      .delete()
      .in("id", [householdA.householdId, householdB.householdId]);
    await serviceClient.auth.admin.deleteUser(householdA.userId);
    await serviceClient.auth.admin.deleteUser(householdB.userId);
  });

  test("a member can read their own household's locations and items", async () => {
    const { data: locations, error: locationsError } = await clientA
      .from("locations")
      .select()
      .eq("id", householdA.locationId);
    expect(locationsError).toBeNull();
    expect(locations).toHaveLength(1);

    const { data: items, error: itemsError } = await clientA
      .from("items")
      .select()
      .eq("id", householdA.itemId);
    expect(itemsError).toBeNull();
    expect(items).toHaveLength(1);
  });

  test("a member can insert/update within their own household", async () => {
    const { data: newLocation, error: insertError } = await clientA
      .from("locations")
      .insert({ household_id: householdA.householdId, name: "New shelf" })
      .select()
      .single();
    expect(insertError).toBeNull();
    expect(newLocation?.name).toBe("New shelf");

    const { data: updated, error: updateError } = await clientA
      .from("items")
      .update({ name: "Renamed item" })
      .eq("id", householdA.itemId)
      .select()
      .single();
    expect(updateError).toBeNull();
    expect(updated?.name).toBe("Renamed item");
  });

  test("a member is denied reading household B's rows — not just an empty result", async () => {
    // Positive control: prove via the service role (which bypasses RLS)
    // that these rows genuinely exist, so household A getting nothing back
    // below is provably RLS omission, not a nonexistent-row false negative.
    const { data: controlLocation } = await serviceClient
      .from("locations")
      .select()
      .eq("id", householdB.locationId)
      .single();
    expect(controlLocation).not.toBeNull();

    const { data: locations, error: locationsError } = await clientA
      .from("locations")
      .select()
      .eq("id", householdB.locationId);
    expect(locationsError).toBeNull();
    expect(locations).toHaveLength(0);

    const { data: controlItem } = await serviceClient
      .from("items")
      .select()
      .eq("id", householdB.itemId)
      .single();
    expect(controlItem).not.toBeNull();

    const { data: items, error: itemsError } = await clientA
      .from("items")
      .select()
      .eq("id", householdB.itemId);
    expect(itemsError).toBeNull();
    expect(items).toHaveLength(0);
  });

  test("a member is denied writing to household B — real errors, not silent no-ops", async () => {
    const { error: insertError } = await clientA.from("locations").insert({
      household_id: householdB.householdId,
      name: "Should not be allowed",
    });
    expect(insertError).not.toBeNull();
    expect(insertError?.code).toBe("42501"); // insufficient_privilege — RLS WITH CHECK violation

    const { error: updateError } = await clientA
      .from("items")
      .update({ name: "Hijacked" })
      .eq("id", householdB.itemId)
      .select()
      .single();
    expect(updateError).not.toBeNull();

    const { data: unchanged } = await serviceClient
      .from("items")
      .select()
      .eq("id", householdB.itemId)
      .single();
    expect(unchanged?.name).not.toBe("Hijacked");
  });
});
