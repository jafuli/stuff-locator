// Integration test for the Home route's real read path — NOT part of
// `npm run test` (see vitest.config.mts's exclude). Requires a running
// local Supabase stack:
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
// src/app/page.tsx is an async Server Component that imports "server-only"
// (via src/server/db/server.ts) — it cannot be synchronously rendered via
// React Testing Library the way the old fixture-backed page.tsx could (see
// this PR's removal of the now-incompatible src/__tests__/page.test.tsx).
// This file instead proves the underlying data layer page.tsx depends on —
// the same household-scoped items/locations read, as a real signed-in
// member — is correct: a populated household's own rows come back (and a
// different household's don't), and a brand-new household with zero items
// comes back empty. Actual DOM rendering (the item list, the empty state,
// the "+ Add item" entry point) is covered by e2e/home.spec.ts against
// this same local stack, and StuffList's own empty-state branch (including
// the new emptyStateAction CTA) is unit-tested directly in
// src/__tests__/stuff-list.test.tsx.
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
  const email = `home-read-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `Home read test household ${label}` })
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

describe("home route's real read path", () => {
  let populated: SeededUser;
  let otherHousehold: SeededUser;
  let empty: SeededUser;
  let populatedClient: SupabaseClient<Database>;
  let emptyClient: SupabaseClient<Database>;
  let locationId: string;
  let itemId: string;

  beforeAll(async () => {
    populated = await seedHouseholdWithOwner("populated");
    otherHousehold = await seedHouseholdWithOwner("other");
    empty = await seedHouseholdWithOwner("empty");

    const { data: location, error: locationError } = await serviceClient
      .from("locations")
      .insert({ household_id: populated.householdId, name: "Garage" })
      .select()
      .single();
    if (locationError) {
      throw new Error(`failed to seed location: ${locationError.message}`);
    }
    locationId = location.id;

    const { data: item, error: itemError } = await serviceClient
      .from("items")
      .insert({
        household_id: populated.householdId,
        location_id: locationId,
        name: "Camping tent",
        detail: "High shelf",
        added_by: populated.userId,
      })
      .select()
      .single();
    if (itemError) {
      throw new Error(`failed to seed item: ${itemError.message}`);
    }
    itemId = item.id;

    // A different household's item — proves the populated household's read
    // is scoped, not just "any item happens to come back".
    const { data: otherLocation, error: otherLocationError } = await serviceClient
      .from("locations")
      .insert({ household_id: otherHousehold.householdId, name: "Attic" })
      .select()
      .single();
    if (otherLocationError) {
      throw new Error(`failed to seed other household's location: ${otherLocationError.message}`);
    }
    const { error: otherItemError } = await serviceClient.from("items").insert({
      household_id: otherHousehold.householdId,
      location_id: otherLocation.id,
      name: "Someone else's passport",
      added_by: otherHousehold.userId,
    });
    if (otherItemError) {
      throw new Error(`failed to seed other household's item: ${otherItemError.message}`);
    }

    populatedClient = await signInAs(populated.email, populated.password);
    emptyClient = await signInAs(empty.email, empty.password);
  }, 30_000);

  afterAll(async () => {
    await serviceClient
      .from("items")
      .delete()
      .in("household_id", [populated.householdId, otherHousehold.householdId, empty.householdId]);
    await serviceClient
      .from("households")
      .delete()
      .in("id", [populated.householdId, otherHousehold.householdId, empty.householdId]);
    await serviceClient.auth.admin.deleteUser(populated.userId);
    await serviceClient.auth.admin.deleteUser(otherHousehold.userId);
    await serviceClient.auth.admin.deleteUser(empty.userId);
  });

  test("a member's household-scoped read returns their own item, with the right shape, and not another household's", async () => {
    const { data: items, error } = await populatedClient
      .from("items")
      .select("*")
      .eq("household_id", populated.householdId);

    expect(error).toBeNull();
    expect(items).toHaveLength(1);
    expect(items?.[0]?.id).toBe(itemId);
    expect(items?.[0]?.name).toBe("Camping tent");
    expect(items?.[0]?.detail).toBe("High shelf");
    expect(items?.[0]?.location_id).toBe(locationId);

    // Same shape page.tsx also reads, scoped to the caller's own household —
    // never sees the other household's item even by name.
    expect(items?.some((item) => item.name === "Someone else's passport")).toBe(false);
  });

  test("a brand-new household with zero items reads back an empty array — the precondition for the empty state", async () => {
    const { data: items, error } = await emptyClient.from("items").select("*").eq("household_id", empty.householdId);

    expect(error).toBeNull();
    expect(items).toHaveLength(0);
  });
});

// Separate, self-contained test: create_household's own migration notes
// multi-household membership is intentionally unrestricted (composite PK on
// household_members, not unique on user_id), and page.tsx resolves which
// household to show via `.order("joined_at", { ascending: true }).limit(1)`
// specifically so that choice is deterministic rather than whatever
// unordered order Postgres happens to return. This proves that ordering
// actually works — inserting the two memberships in the OPPOSITE order from
// their joined_at values, so a pass here can only mean the ORDER BY is
// doing the work, not insertion order coincidentally matching.
test("a user who belongs to two households resolves to the earliest-joined one, deterministically", async () => {
  const email = `home-read-test-multi-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";

  const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) {
    throw new Error(`failed to create test user: ${userError.message}`);
  }

  const { data: earlierHousehold, error: earlierHouseholdError } = await serviceClient
    .from("households")
    .insert({ name: "Multi-household test: earlier" })
    .select()
    .single();
  if (earlierHouseholdError) {
    throw new Error(`failed to seed earlier household: ${earlierHouseholdError.message}`);
  }

  const { data: laterHousehold, error: laterHouseholdError } = await serviceClient
    .from("households")
    .insert({ name: "Multi-household test: later" })
    .select()
    .single();
  if (laterHouseholdError) {
    throw new Error(`failed to seed later household: ${laterHouseholdError.message}`);
  }

  // Later-joined membership inserted FIRST, earlier-joined SECOND —
  // deliberately reversed from joined_at order.
  const { error: laterMemberError } = await serviceClient.from("household_members").insert({
    household_id: laterHousehold.id,
    user_id: userData.user.id,
    joined_at: "2020-01-02T00:00:00Z",
  });
  if (laterMemberError) {
    throw new Error(`failed to seed later membership: ${laterMemberError.message}`);
  }
  const { error: earlierMemberError } = await serviceClient.from("household_members").insert({
    household_id: earlierHousehold.id,
    user_id: userData.user.id,
    joined_at: "2020-01-01T00:00:00Z",
  });
  if (earlierMemberError) {
    throw new Error(`failed to seed earlier membership: ${earlierMemberError.message}`);
  }

  try {
    const client = await signInAs(email, password);
    // The exact query page.tsx runs to resolve which household to show.
    const { data: membership, error } = await client
      .from("household_members")
      .select("household_id")
      .eq("user_id", userData.user.id)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    expect(membership?.household_id).toBe(earlierHousehold.id);
  } finally {
    await serviceClient.from("households").delete().in("id", [earlierHousehold.id, laterHousehold.id]);
    await serviceClient.auth.admin.deleteUser(userData.user.id);
  }
});
