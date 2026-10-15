// Integration test for Locations 2/7: unique place names, the internal
// ensure_location_path, and the atomic stash_item / move_item(p_new_path)
// functions. NOT part of `npm run test` — needs a running local Supabase stack
// with the migration applied. Run with `npm run test:rls`.
//
// What it proves:
//   - stash_item with a new path creates the places and the item in one call,
//     and a second call with the same path reuses them (the reproduced bug)
//   - names are unique per parent, ignoring case — and the same name under a
//     different parent is fine; a raw duplicate insert raises 23505
//   - names are normalized; empty / whitespace-only names are rejected
//   - ensure_location_path is not callable by clients
//   - a failure halfway through a path leaves no places behind
//   - another household's place is rejected; anon can't call at all
//   - move_item with p_new_path moves into freshly created places atomically
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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

interface TestUser {
  userId: string;
  email: string;
  password: string;
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `stash-item-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    throw new Error(`failed to create test user "${label}": ${error.message}`);
  }
  return { userId: data.user.id, email, password };
}

async function signInAs(user: TestUser): Promise<SupabaseClient<Database>> {
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anonClient.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) {
    throw new Error(`failed to sign in as ${user.email}: ${error.message}`);
  }
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function seedHousehold(label: string, member: TestUser): Promise<string> {
  const { data, error } = await serviceClient
    .from("households")
    .insert({ name: `stash_item test household ${label}` })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to seed household "${label}": ${error.message}`);
  }
  const { error: memberError } = await serviceClient
    .from("household_members")
    .insert({ household_id: data.id, user_id: member.userId, role: "owner" });
  if (memberError) {
    throw new Error(`failed to add member to "${label}": ${memberError.message}`);
  }
  return data.id;
}

async function seedLocation(householdId: string, name: string, parentId: string | null = null): Promise<string> {
  const { data, error } = await serviceClient
    .from("locations")
    .insert({ household_id: householdId, name, parent_id: parentId })
    .select("id")
    .single();
  if (error) {
    throw new Error(`failed to seed location "${name}": ${error.message}`);
  }
  return data.id;
}

async function placesNamed(householdId: string, name: string) {
  const { data, error } = await serviceClient
    .from("locations")
    .select("id, parent_id, name")
    .eq("household_id", householdId)
    .ilike("name", name);
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function countPlaces(householdId: string): Promise<number> {
  const { count, error } = await serviceClient
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

describe("unique place names, stash_item and move_item(p_new_path)", () => {
  let owner: TestUser;
  let otherOwner: TestUser;
  let householdId: string;
  let otherHouseholdId: string;
  let clientOwner: SupabaseClient<Database>;
  let clientOther: SupabaseClient<Database>;
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);

  beforeAll(async () => {
    owner = await createTestUser("owner");
    otherOwner = await createTestUser("other");
    householdId = await seedHousehold("a", owner);
    otherHouseholdId = await seedHousehold("b", otherOwner);
    clientOwner = await signInAs(owner);
    clientOther = await signInAs(otherOwner);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [householdId, otherHouseholdId]);
    await serviceClient.auth.admin.deleteUser(owner.userId);
    await serviceClient.auth.admin.deleteUser(otherOwner.userId);
  });

  test("stash_item with a new path creates the places and the item; the same path again reuses them", async () => {
    const first = await clientOwner.rpc("stash_item", {
      p_name: "Passport",
      p_detail: "  blue one  ",
      p_new_path: ["Study", "Cabinet", "Top drawer"],
    });
    expect(first.error).toBeNull();
    expect(first.data?.added_by).toBe(owner.userId);
    expect(first.data?.detail).toBe("blue one");

    const second = await clientOwner.rpc("stash_item", {
      p_name: "Birth certificate",
      p_new_path: ["Study", "Cabinet", "Top drawer"],
    });
    expect(second.error).toBeNull();
    expect(second.data?.location_id).toBe(first.data?.location_id);

    // One set of locations, two items.
    expect(await placesNamed(householdId, "Study")).toHaveLength(1);
    expect(await placesNamed(householdId, "Cabinet")).toHaveLength(1);
    expect(await placesNamed(householdId, "Top drawer")).toHaveLength(1);
  });

  test("a case-variant of an existing place resolves to it instead of creating a second one", async () => {
    const original = await clientOwner.rpc("stash_item", { p_name: "Stapler", p_new_path: ["Office"] });
    const variant = await clientOwner.rpc("stash_item", { p_name: "Tape", p_new_path: ["  oFFice "] });

    expect(variant.error).toBeNull();
    expect(variant.data?.location_id).toBe(original.data?.location_id);
    expect(await placesNamed(householdId, "office")).toHaveLength(1);
  });

  test("a raw duplicate insert raises a unique violation (23505), ignoring case", async () => {
    const parent = await seedLocation(householdId, "Garage");
    await seedLocation(householdId, "Shed", parent);

    const { error } = await serviceClient
      .from("locations")
      .insert({ household_id: householdId, name: "SHED", parent_id: parent });
    expect(error?.code).toBe("23505");

    // Top level collides too (NULL parents must not count as distinct).
    const { error: topLevelError } = await serviceClient
      .from("locations")
      .insert({ household_id: householdId, name: "GARAGE", parent_id: null });
    expect(topLevelError?.code).toBe("23505");
  });

  test("the same name under a different parent is allowed", async () => {
    const kitchen = await seedLocation(householdId, "Kitchen");
    const hallway = await seedLocation(householdId, "Hallway");

    const a = await clientOwner.rpc("stash_item", {
      p_name: "Spare keys",
      p_location_id: kitchen,
      p_new_path: ["Top drawer"],
    });
    const b = await clientOwner.rpc("stash_item", {
      p_name: "Torch",
      p_location_id: hallway,
      p_new_path: ["Top drawer"],
    });

    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data?.location_id).not.toBe(b.data?.location_id);
    expect(await placesNamed(householdId, "Top drawer")).toHaveLength(3); // + Study › Cabinet › Top drawer
  });

  test("place names are normalized on every write path", async () => {
    const id = await seedLocation(householdId, "  Spare   room \t");
    const { data } = await serviceClient.from("locations").select("name").eq("id", id).single();
    expect(data?.name).toBe("Spare room");
  });

  test("empty and whitespace-only names are rejected (item and place)", async () => {
    const before = await countPlaces(householdId);

    const emptyItem = await clientOwner.rpc("stash_item", { p_name: "   ", p_new_path: ["Loft"] });
    expect(emptyItem.error?.code).toBe("23514");

    const emptyPlace = await clientOwner.rpc("stash_item", { p_name: "Ladder", p_new_path: ["   "] });
    expect(emptyPlace.error?.code).toBe("23514");

    const { error: rawError } = await serviceClient
      .from("locations")
      .insert({ household_id: householdId, name: "  ", parent_id: null });
    expect(rawError?.code).toBe("23514");

    expect(await countPlaces(householdId)).toBe(before);
  });

  test("a failure halfway through a path leaves no places behind (one transaction)", async () => {
    const before = await countPlaces(householdId);

    const { error } = await clientOwner.rpc("stash_item", {
      p_name: "Suitcase",
      p_new_path: ["Attic", "   "],
    });
    expect(error).not.toBeNull();

    expect(await placesNamed(householdId, "Attic")).toHaveLength(0);
    expect(await countPlaces(householdId)).toBe(before);
  });

  test("stash_item needs a location or a path", async () => {
    const { error } = await clientOwner.rpc("stash_item", { p_name: "Floating item" });
    expect(error?.message).toMatch(/stash_item:.*location or a new place path is required/i);
  });

  test("ensure_location_path is not callable by clients", async () => {
    const { error } = await clientOwner.rpc(
      "ensure_location_path" as never,
      {
        p_household_id: householdId,
        p_parent_id: null,
        p_names: ["Sneaky"],
      } as never,
    );
    expect(error).not.toBeNull();
    expect(await placesNamed(householdId, "Sneaky")).toHaveLength(0);
  });

  test("a place in another household is rejected, and nothing is created", async () => {
    const theirPlace = await seedLocation(otherHouseholdId, "Their cellar");
    const before = await countPlaces(otherHouseholdId);

    const { data, error } = await clientOwner.rpc("stash_item", {
      p_name: "Trespasser",
      p_location_id: theirPlace,
      p_new_path: ["Hidden shelf"],
    });
    expect(data).toBeNull();
    expect(error?.message).toMatch(/stash_item:.*not found or not accessible/i);
    expect(await countPlaces(otherHouseholdId)).toBe(before);
  });

  test("RLS isolation holds: each caller's top-level path lands in their own household", async () => {
    const mine = await clientOwner.rpc("stash_item", { p_name: "Mine", p_new_path: ["Isolation room"] });
    const theirs = await clientOther.rpc("stash_item", { p_name: "Theirs", p_new_path: ["Isolation room"] });

    expect(mine.data?.household_id).toBe(householdId);
    expect(theirs.data?.household_id).toBe(otherHouseholdId);
    expect(mine.data?.location_id).not.toBe(theirs.data?.location_id);
  });

  test("an unauthenticated caller can't call stash_item or move_item", async () => {
    const stash = await anonClient.rpc("stash_item", { p_name: "Ghost", p_new_path: ["Nowhere"] });
    expect(stash.error).not.toBeNull();

    const move = await anonClient.rpc("move_item", { p_item_id: randomUUID(), p_new_path: ["Nowhere"] });
    expect(move.error).not.toBeNull();

    expect(await placesNamed(householdId, "Nowhere")).toHaveLength(0);
  });

  test("move_item with p_new_path moves the item into freshly created places, atomically", async () => {
    const start = await seedLocation(householdId, "Start");
    const item = await clientOwner.rpc("stash_item", { p_name: "Boxed lamp", p_location_id: start });
    const itemId = item.data?.id ?? "";

    const moved = await clientOwner.rpc("move_item", {
      p_item_id: itemId,
      p_new_location_id: start,
      p_new_path: ["Crate", "Left side"],
    });
    expect(moved.error).toBeNull();
    expect(moved.data?.last_moved_by).toBe(owner.userId);

    const crate = (await placesNamed(householdId, "Crate")).at(0);
    expect(crate?.parent_id).toBe(start);
    const leftSide = (await placesNamed(householdId, "Left side")).at(0);
    expect(leftSide?.parent_id).toBe(crate?.id);
    expect(moved.data?.location_id).toBe(leftSide?.id);

    // A failing move creates nothing and leaves the item where it was.
    const before = await countPlaces(householdId);
    const failed = await clientOwner.rpc("move_item", {
      p_item_id: itemId,
      p_new_location_id: start,
      p_new_path: ["Brand new", "   "],
    });
    expect(failed.error).not.toBeNull();
    expect(await placesNamed(householdId, "Brand new")).toHaveLength(0);
    expect(await countPlaces(householdId)).toBe(before);
    const { data: unchanged } = await serviceClient.from("items").select("location_id").eq("id", itemId).single();
    expect(unchanged?.location_id).toBe(leftSide?.id);
  });
});
