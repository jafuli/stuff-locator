// Integration test for the household limits (ADR 0015,
// 20261124115842_household_limits.sql). NOT part of `npm run test` — needs a
// running local Supabase stack. Run with `npm run test:rls`.
//
// Proves, through the real write functions called as a signed-in member:
//   - item cap: 100 per household, checked under the household lock (two
//     concurrent stashes at 99 can't both pass), and deleting frees a slot
//   - place cap: 100 per household, through stash_item, move_item with a new
//     path and create_location; reusing existing places is never refused
//   - depth cap: 8 places per path, through a new path, create_location and
//     move_container (a moved subtree can't push its deepest place past 8)
//   - text lengths: CHECK constraints at exactly the limits (23514 one over)
//   - an email with a 64-character local part still signs up (its seeded
//     display name is clamped)
//   - activity retention: a household keeps exactly its newest 200 events
//
// Each limit raises its own SQLSTATE (SL001–SL003); the UI maps them to copy.
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

const ITEM_LIMIT_REACHED = "SL001";
const PLACE_LIMIT_REACHED = "SL002";
const DEPTH_LIMIT_REACHED = "SL003";
const CHECK_VIOLATION = "23514";

interface Member {
  userId: string;
  householdId: string;
  client: SupabaseClient<Database>;
}

const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

/** A fresh user, signed in, alone in a fresh household. */
async function newMember(label: string): Promise<Member> {
  const email = `limits-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    throw new Error(`failed to create test user "${label}": ${error.message}`);
  }
  createdUserIds.push(data.user.id);

  const { data: household, error: householdError } = await serviceClient
    .from("households")
    .insert({ name: `limits test ${label}` })
    .select("id")
    .single();
  if (householdError) {
    throw new Error(`failed to seed household "${label}": ${householdError.message}`);
  }
  createdHouseholdIds.push(household.id);

  const { error: memberError } = await serviceClient
    .from("household_members")
    .insert({ household_id: household.id, user_id: data.user.id, role: "owner" });
  if (memberError) {
    throw new Error(`failed to add member to "${label}": ${memberError.message}`);
  }

  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`failed to sign in as ${email}: ${signInError.message}`);
  }
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  return { userId: data.user.id, householdId: household.id, client };
}

/** Seeds `count` top-level places directly (service role: no events, no caps). */
async function seedPlaces(member: Member, count: number, prefix = "Place"): Promise<string[]> {
  const rows = Array.from({ length: count }, (_, index) => ({
    household_id: member.householdId,
    name: `${prefix} ${String(index + 1)}`,
  }));
  const { data, error } = await serviceClient.from("locations").insert(rows).select("id");
  if (error) {
    throw new Error(`failed to seed places: ${error.message}`);
  }
  return data.map((row) => row.id);
}

/** Seeds a chain of `depth` nested places; returns their ids, outermost first. */
async function seedChain(member: Member, depth: number, prefix = "Level"): Promise<string[]> {
  const ids: string[] = [];
  let parentId: string | null = null;
  for (let level = 1; level <= depth; level += 1) {
    const { data, error }: { data: { id: string } | null; error: { message: string } | null } = await serviceClient
      .from("locations")
      .insert({ household_id: member.householdId, name: `${prefix} ${String(level)}`, parent_id: parentId })
      .select("id")
      .single();
    if (error) {
      throw new Error(`failed to seed chain level ${String(level)}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`chain level ${String(level)} returned no row`);
    }
    ids.push(data.id);
    parentId = data.id;
  }
  return ids;
}

/** Seeds `count` items in one place directly (service role: no events, no caps). */
async function seedItems(member: Member, locationId: string, count: number): Promise<void> {
  const rows = Array.from({ length: count }, (_, index) => ({
    household_id: member.householdId,
    location_id: locationId,
    name: `Thing ${String(index + 1)}`,
    added_by: member.userId,
  }));
  const { error } = await serviceClient.from("items").insert(rows);
  if (error) {
    throw new Error(`failed to seed items: ${error.message}`);
  }
}

async function countRows(table: "items" | "locations" | "activity_events", householdId: string): Promise<number> {
  const { count, error } = await serviceClient
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

function names(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix} ${String(index + 1)}`);
}

afterAll(async () => {
  if (createdHouseholdIds.length > 0) {
    // Items reference locations with ON DELETE RESTRICT, so clear them first.
    await serviceClient.from("items").delete().in("household_id", createdHouseholdIds);
    await serviceClient.from("households").delete().in("id", createdHouseholdIds);
  }
  for (const userId of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(userId);
  }
}, 60_000);

describe("item cap (100 per household)", () => {
  let member: Member;
  let shelfId: string;

  beforeAll(async () => {
    member = await newMember("items");
    [shelfId = ""] = await seedPlaces(member, 1, "Shelf");
    await seedItems(member, shelfId, 99);
  }, 30_000);

  test("two concurrent stashes at 99 items: exactly one gets the last slot", async () => {
    const results = await Promise.all([
      member.client.rpc("stash_item", { p_name: "Racer A", p_location_id: shelfId }),
      member.client.rpc("stash_item", { p_name: "Racer B", p_location_id: shelfId }),
    ]);

    const succeeded = results.filter((result) => result.error === null);
    const refused = results.filter((result) => result.error !== null);
    expect(succeeded).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]?.error?.code).toBe(ITEM_LIMIT_REACHED);
    expect(await countRows("items", member.householdId)).toBe(100);
  });

  test("a refused stash creates none of its new places", async () => {
    const before = await countRows("locations", member.householdId);
    const { error } = await member.client.rpc("stash_item", { p_name: "One too many", p_new_path: ["Brand new"] });

    expect(error?.code).toBe(ITEM_LIMIT_REACHED);
    expect(await countRows("locations", member.householdId)).toBe(before);
  });

  test("deleting an item frees a slot", async () => {
    const { data: victim } = await serviceClient
      .from("items")
      .select("id")
      .eq("household_id", member.householdId)
      .limit(1)
      .single();
    const { error: deleteError } = await member.client.rpc("delete_item", { p_item_id: victim?.id ?? "" });
    expect(deleteError).toBeNull();

    const { error } = await member.client.rpc("stash_item", { p_name: "Back in", p_location_id: shelfId });
    expect(error).toBeNull();
    expect(await countRows("items", member.householdId)).toBe(100);
  });
});

describe("place cap (100 per household)", () => {
  let member: Member;
  let placeIds: string[];
  let itemId: string;

  beforeAll(async () => {
    member = await newMember("places");
    placeIds = await seedPlaces(member, 98);
    const { data, error } = await member.client.rpc("stash_item", {
      p_name: "Passport",
      p_location_id: placeIds[0] ?? "",
    });
    if (error) {
      throw new Error(error.message);
    }
    itemId = data.id;
  }, 30_000);

  test("a new path that would cross 100 is refused as a whole", async () => {
    // 98 places + 3 new = 101.
    const { error } = await member.client.rpc("stash_item", { p_name: "Tent", p_new_path: ["Loft", "Box", "Bag"] });
    expect(error?.code).toBe(PLACE_LIMIT_REACHED);
    expect(await countRows("locations", member.householdId)).toBe(98);
  });

  test("create_location ('+ Add a place here') fills the last slots, then refuses", async () => {
    const first = await member.client.rpc("create_location", { p_name: "Garage" });
    const second = await member.client.rpc("create_location", { p_name: "Cellar" });
    const third = await member.client.rpc("create_location", { p_name: "Attic" });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(third.error?.code).toBe(PLACE_LIMIT_REACHED);
    expect(await countRows("locations", member.householdId)).toBe(100);
  });

  test("at the cap, stash_item with a new place and move_item with a new path are refused", async () => {
    const stash = await member.client.rpc("stash_item", { p_name: "Tent", p_new_path: ["Shed"] });
    const move = await member.client.rpc("move_item", { p_item_id: itemId, p_new_path: ["Shed"] });

    expect(stash.error?.code).toBe(PLACE_LIMIT_REACHED);
    expect(move.error?.code).toBe(PLACE_LIMIT_REACHED);
  });

  test("at the cap, existing places stay usable — including when typed as a path", async () => {
    const intoExisting = await member.client.rpc("stash_item", { p_name: "Tent", p_location_id: placeIds[1] ?? "" });
    const reusedByName = await member.client.rpc("stash_item", { p_name: "Rope", p_new_path: ["garage"] });

    expect(intoExisting.error).toBeNull();
    expect(reusedByName.error).toBeNull();
    expect(await countRows("locations", member.householdId)).toBe(100);
  });
});

describe("depth cap (8 places per path)", () => {
  let member: Member;
  let chain: string[];

  beforeAll(async () => {
    member = await newMember("depth");
    chain = await seedChain(member, 6);
  }, 30_000);

  test("a new path may reach exactly 8, not 9", async () => {
    const atLimit = await member.client.rpc("stash_item", {
      p_name: "Deep thing",
      p_location_id: chain[5] ?? "",
      p_new_path: ["Seventh", "Eighth"],
    });
    const overLimit = await member.client.rpc("stash_item", {
      p_name: "Too deep",
      p_location_id: chain[5] ?? "",
      p_new_path: ["Seventh", "Eighth", "Ninth"],
    });

    expect(atLimit.error).toBeNull();
    expect(overLimit.error?.code).toBe(DEPTH_LIMIT_REACHED);
  });

  test("a top-level path of 9 new places is refused before anything is created", async () => {
    const before = await countRows("locations", member.householdId);
    const { error } = await member.client.rpc("stash_item", { p_name: "Tower", p_new_path: names(9, "Floor") });

    expect(error?.code).toBe(DEPTH_LIMIT_REACHED);
    expect(await countRows("locations", member.householdId)).toBe(before);
  });

  test("move_item with a new path is held to the same limit", async () => {
    const { data: item, error: stashError } = await member.client.rpc("stash_item", {
      p_name: "Mover",
      p_location_id: chain[0] ?? "",
    });
    expect(stashError).toBeNull();

    const { error } = await member.client.rpc("move_item", {
      p_item_id: item?.id ?? "",
      p_new_location_id: chain[5] ?? "",
      p_new_path: ["A", "B", "C"],
    });
    expect(error?.code).toBe(DEPTH_LIMIT_REACHED);
  });

  test("create_location can't add a place inside one that is already 8 deep", async () => {
    const { data: eighth } = await serviceClient
      .from("locations")
      .select("id")
      .eq("household_id", member.householdId)
      .eq("name", "Eighth")
      .single();

    const { error } = await member.client.rpc("create_location", { p_name: "Ninth", p_parent_id: eighth?.id ?? "" });
    expect(error?.code).toBe(DEPTH_LIMIT_REACHED);
  });

  test("move_container: a subtree can go where its deepest place lands on 8, not 9", async () => {
    // A three-level subtree at the top level: Box › Bag › Pouch.
    const subtree = await seedChain(member, 3, "Box level");
    const boxId = subtree[0] ?? "";

    // Under chain[4] (depth 5): 5 + 3 = 8.
    const atLimit = await member.client.rpc("move_container", { p_location_id: boxId, p_new_parent_id: chain[4] });
    expect(atLimit.error).toBeNull();

    // Under chain[5] (depth 6): 6 + 3 = 9.
    const overLimit = await member.client.rpc("move_container", { p_location_id: boxId, p_new_parent_id: chain[5] });
    expect(overLimit.error?.code).toBe(DEPTH_LIMIT_REACHED);

    const { data: box } = await serviceClient.from("locations").select("parent_id").eq("id", boxId).single();
    expect(box?.parent_id).toBe(chain[4]);
  });
});

describe("text lengths", () => {
  let member: Member;
  let placeId: string;

  beforeAll(async () => {
    member = await newMember("lengths");
    [placeId = ""] = await seedPlaces(member, 1);
  }, 30_000);

  test("item name: 80 characters is fine, 81 is refused", async () => {
    const atLimit = await member.client.rpc("stash_item", { p_name: "n".repeat(80), p_location_id: placeId });
    const overLimit = await member.client.rpc("stash_item", { p_name: "n".repeat(81), p_location_id: placeId });

    expect(atLimit.error).toBeNull();
    expect(overLimit.error?.code).toBe(CHECK_VIOLATION);
  });

  test("detail: 500 characters is fine, 501 is refused", async () => {
    const atLimit = await member.client.rpc("stash_item", {
      p_name: "Long detail",
      p_detail: "d".repeat(500),
      p_location_id: placeId,
    });
    const overLimit = await member.client.rpc("stash_item", {
      p_name: "Too long detail",
      p_detail: "d".repeat(501),
      p_location_id: placeId,
    });

    expect(atLimit.error).toBeNull();
    expect(overLimit.error?.code).toBe(CHECK_VIOLATION);
  });

  test("place name: 60 characters is fine, 61 is refused (create, rename and new paths)", async () => {
    const atLimit = await member.client.rpc("create_location", { p_name: "p".repeat(60) });
    const created = await member.client.rpc("create_location", { p_name: "p".repeat(61) });
    const renamed = await member.client.rpc("rename_location", { p_location_id: placeId, p_name: "r".repeat(61) });
    const viaPath = await member.client.rpc("stash_item", { p_name: "Thing", p_new_path: ["q".repeat(61)] });

    expect(atLimit.error).toBeNull();
    expect(created.error?.code).toBe(CHECK_VIOLATION);
    expect(renamed.error?.code).toBe(CHECK_VIOLATION);
    expect(viaPath.error?.code).toBe(CHECK_VIOLATION);
  });

  test("display name: 50 characters is fine, 51 is refused", async () => {
    const atLimit = await member.client
      .from("profiles")
      .update({ display_name: "a".repeat(50) })
      .eq("user_id", member.userId);
    const overLimit = await member.client
      .from("profiles")
      .update({ display_name: "a".repeat(51) })
      .eq("user_id", member.userId);

    expect(atLimit.error).toBeNull();
    expect(overLimit.error?.code).toBe(CHECK_VIOLATION);
  });

  test("household name: 50 characters is fine, 51 is refused", async () => {
    const atLimit = await member.client
      .from("households")
      .update({ name: "h".repeat(50) })
      .eq("id", member.householdId);
    const overLimit = await member.client
      .from("households")
      .update({ name: "h".repeat(51) })
      .eq("id", member.householdId);

    expect(atLimit.error).toBeNull();
    expect(overLimit.error?.code).toBe(CHECK_VIOLATION);
  });

  test("an email with a 64-character local part still signs up, with its display name clamped to 50", async () => {
    const localPart = `long-${randomUUID().replaceAll("-", "")}`.padEnd(64, "x");
    const { data, error } = await serviceClient.auth.admin.createUser({
      email: `${localPart}@example.com`,
      password: "a-long-enough-test-password-1!",
      email_confirm: true,
    });
    expect(error).toBeNull();
    if (data.user) {
      createdUserIds.push(data.user.id);
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", data.user?.id ?? "")
      .single();
    expect(profile?.display_name).toBe(localPart.slice(0, 50));
  });
});

describe("activity retention (newest 200 per household)", () => {
  test("a household that writes more than 200 events keeps exactly the newest 200", async () => {
    const member = await newMember("retention");
    const [fromId = "", toId = ""] = await seedPlaces(member, 2);
    const { data: item, error } = await member.client.rpc("stash_item", { p_name: "Keys", p_location_id: fromId });
    if (error) {
      throw new Error(error.message);
    }

    // 1 item_added + 210 moves = 211 events written.
    for (let move = 0; move < 210; move += 1) {
      const { error: moveError } = await member.client.rpc("move_item", {
        p_item_id: item.id,
        p_new_location_id: move % 2 === 0 ? toId : fromId,
      });
      if (moveError) {
        throw new Error(moveError.message);
      }
    }

    expect(await countRows("activity_events", member.householdId)).toBe(200);

    // The oldest event (the item_added) is the one that went.
    const { data: kinds } = await serviceClient
      .from("activity_events")
      .select("kind")
      .eq("household_id", member.householdId)
      .eq("kind", "item_added");
    expect(kinds).toHaveLength(0);
  }, 120_000);
});
