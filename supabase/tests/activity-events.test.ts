// Integration test for Locations 3/7: the activity_events log, every writer,
// and the lock on direct writes (ADR 0011). NOT part of `npm run test` —
// needs a running local Supabase stack with the migration applied. Run with
// `npm run test:rls`.
//
// Proves:
//   - each writer writes exactly the expected events, in the same
//     transaction as the change; a failed change writes none; a no-op
//     update_item writes none
//   - authorization: a member of household A can't drive any writer against
//     household B's rows; anon can't call any of them
//   - direct client INSERT/UPDATE/DELETE on items, locations and
//     activity_events are refused (privilege, not RLS filtering)
//
// Not covered here: the migration's one-off backfill. It runs once, at
// migration time, over rows that exist then — a fresh CI database has none.
// It was verified by hand against real dev data (see the PR's "How to test").
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
const PERMISSION_DENIED = "42501";

interface TestUser {
  userId: string;
  email: string;
  password: string;
}

async function createTestUser(label: string): Promise<TestUser> {
  const email = `activity-events-test-${label}-${randomUUID()}@example.com`;
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
    .insert({ name: `activity_events test household ${label}` })
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

async function eventsFor(subjectId: string) {
  const { data, error } = await serviceClient
    .from("activity_events")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function householdEventCount(householdId: string): Promise<number> {
  const { count, error } = await serviceClient
    .from("activity_events")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

function kinds(events: { kind: string }[]): string[] {
  return events.map((event) => event.kind);
}

describe("activity_events and the writer functions", () => {
  let owner: TestUser;
  let partner: TestUser;
  let outsider: TestUser;
  let householdId: string;
  let otherHouseholdId: string;
  let clientOwner: SupabaseClient<Database>;
  let clientPartner: SupabaseClient<Database>;
  let clientOutsider: SupabaseClient<Database>;
  const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY);

  beforeAll(async () => {
    owner = await createTestUser("owner");
    partner = await createTestUser("partner");
    outsider = await createTestUser("outsider");
    householdId = await seedHousehold("a", owner);
    otherHouseholdId = await seedHousehold("b", outsider);
    await serviceClient
      .from("household_members")
      .insert({ household_id: householdId, user_id: partner.userId, role: "member" });
    clientOwner = await signInAs(owner);
    clientPartner = await signInAs(partner);
    clientOutsider = await signInAs(outsider);
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().in("id", [householdId, otherHouseholdId]);
    for (const user of [owner, partner, outsider]) {
      await serviceClient.auth.admin.deleteUser(user.userId);
    }
  });

  test("stash_item writes item_added with the full path, including places it created", async () => {
    const { data: item, error } = await clientOwner.rpc("stash_item", {
      p_name: "Passport",
      p_detail: "blue one",
      p_new_path: ["Study", "Cabinet"],
    });
    expect(error).toBeNull();

    const events = await eventsFor(item?.id ?? "");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "item_added",
      household_id: householdId,
      actor_id: owner.userId,
      subject_name: "Passport",
      from_text: null,
      to_text: "Study › Cabinet",
      detail_text: "blue one",
    });
  });

  test("move_item writes item_moved with from → to, keeps provenance current, and a same-place move is a no-op", async () => {
    const kitchen = await seedLocation(householdId, "Kitchen");
    const bowl = await seedLocation(householdId, "Key bowl", kitchen);
    const hall = await seedLocation(householdId, "Hall");
    const { data: item } = await clientOwner.rpc("stash_item", { p_name: "Spare keys", p_location_id: bowl });
    const itemId = item?.id ?? "";

    const moved = await clientPartner.rpc("move_item", { p_item_id: itemId, p_new_location_id: hall });
    expect(moved.error).toBeNull();
    expect(moved.data?.last_moved_by).toBe(partner.userId);

    const again = await clientPartner.rpc("move_item", { p_item_id: itemId, p_new_location_id: hall });
    expect(again.error).toBeNull();

    const back = await clientOwner.rpc("move_item", { p_item_id: itemId, p_new_location_id: bowl });
    expect(back.error).toBeNull();

    const events = await eventsFor(itemId);
    // Every move is kept (two), the repeat was a no-op, and added is there.
    expect(kinds(events)).toEqual(["item_added", "item_moved", "item_moved"]);
    expect(events[0]?.to_text).toBe("Kitchen › Key bowl");
    expect(events[1]).toMatchObject({ actor_id: partner.userId, from_text: "Kitchen › Key bowl", to_text: "Hall" });
    expect(events[2]).toMatchObject({ actor_id: owner.userId, from_text: "Hall", to_text: "Kitchen › Key bowl" });
  });

  test("update_item writes only the events for what changed; a no-op writes none", async () => {
    const a = await seedLocation(householdId, "Shelf A");
    const b = await seedLocation(householdId, "Shelf B");
    const { data: item } = await clientOwner.rpc("stash_item", {
      p_name: "Camping tent",
      p_detail: "poles in the blue bag",
      p_location_id: a,
    });
    const itemId = item?.id ?? "";

    // Nothing changed (same name, same detail, same place).
    const noop = await clientPartner.rpc("update_item", {
      p_item_id: itemId,
      p_name: "  Camping tent ",
      p_detail: "poles in the blue bag",
      p_location_id: a,
    });
    expect(noop.error).toBeNull();
    expect(kinds(await eventsFor(itemId))).toEqual(["item_added"]);

    // Rename only.
    await clientPartner.rpc("update_item", {
      p_item_id: itemId,
      p_name: "Tent (4 person)",
      p_detail: "poles in the blue bag",
    });
    // Detail removed.
    await clientPartner.rpc("update_item", { p_item_id: itemId, p_name: "Tent (4 person)" });
    // Moved into a brand-new place.
    const moved = await clientPartner.rpc("update_item", {
      p_item_id: itemId,
      p_name: "Tent (4 person)",
      p_location_id: b,
      p_new_path: ["Crate"],
    });
    expect(moved.error).toBeNull();
    expect(moved.data?.last_moved_by).toBe(partner.userId);

    const events = await eventsFor(itemId);
    expect(kinds(events)).toEqual(["item_added", "item_renamed", "item_detail_changed", "item_moved"]);
    expect(events[1]).toMatchObject({ from_text: "Camping tent", to_text: "Tent (4 person)" });
    expect(events[2]).toMatchObject({ from_text: "poles in the blue bag", detail_text: null });
    expect(events[3]).toMatchObject({ from_text: "Shelf A", to_text: "Shelf B › Crate" });
  });

  test("one update_item that renames, edits the detail and moves writes all three events in one transaction", async () => {
    const a = await seedLocation(householdId, "Drawer 1");
    const b = await seedLocation(householdId, "Drawer 2");
    const { data: item } = await clientOwner.rpc("stash_item", { p_name: "Torch", p_location_id: a });
    const itemId = item?.id ?? "";

    const { error } = await clientOwner.rpc("update_item", {
      p_item_id: itemId,
      p_name: "Head torch",
      p_detail: "needs AAA",
      p_location_id: b,
    });
    expect(error).toBeNull();
    expect(kinds(await eventsFor(itemId)).sort()).toEqual(
      ["item_added", "item_detail_changed", "item_moved", "item_renamed"].sort(),
    );
  });

  test("a failed update_item changes nothing and writes no event", async () => {
    const a = await seedLocation(householdId, "Box A");
    const { data: item } = await clientOwner.rpc("stash_item", { p_name: "Scissors", p_location_id: a });
    const itemId = item?.id ?? "";
    const before = await householdEventCount(householdId);

    // Valid rename + a path whose second level is empty: the rename must roll back too.
    const { error } = await clientOwner.rpc("update_item", {
      p_item_id: itemId,
      p_name: "Big scissors",
      p_location_id: a,
      p_new_path: ["Inner", "   "],
    });
    expect(error).not.toBeNull();

    expect(await householdEventCount(householdId)).toBe(before);
    const { data: row } = await serviceClient.from("items").select("name, location_id").eq("id", itemId).single();
    expect(row).toMatchObject({ name: "Scissors", location_id: a });
    const { data: leaked } = await serviceClient
      .from("locations")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", "Inner");
    expect(leaked).toHaveLength(0);
  });

  test("delete_item writes item_deleted with where it was, and the event outlives the item", async () => {
    const drawer = await seedLocation(householdId, "Top drawer");
    const { data: item } = await clientOwner.rpc("stash_item", { p_name: "Old charger", p_location_id: drawer });
    const itemId = item?.id ?? "";

    const { error } = await clientPartner.rpc("delete_item", { p_item_id: itemId });
    expect(error).toBeNull();

    const { data: gone } = await serviceClient.from("items").select("id").eq("id", itemId).maybeSingle();
    expect(gone).toBeNull();
    const events = await eventsFor(itemId);
    expect(kinds(events)).toEqual(["item_added", "item_deleted"]);
    expect(events[1]).toMatchObject({ actor_id: partner.userId, subject_name: "Old charger", from_text: "Top drawer" });
  });

  test("create_location writes no event, normalizes, and a duplicate sibling raises 23505", async () => {
    const before = await householdEventCount(householdId);

    const { data: top, error } = await clientOwner.rpc("create_location", { p_name: "  Attic  " });
    expect(error).toBeNull();
    expect(top?.name).toBe("Attic");
    expect(top?.parent_id).toBeNull();
    expect(top?.household_id).toBe(householdId);

    const { data: child } = await clientOwner.rpc("create_location", { p_name: "Trunk", p_parent_id: top?.id });
    expect(child?.parent_id).toBe(top?.id);

    const duplicate = await clientOwner.rpc("create_location", { p_name: "attic" });
    expect(duplicate.error?.code).toBe("23505");

    const empty = await clientOwner.rpc("create_location", { p_name: "   " });
    expect(empty.error?.code).toBe("23514");

    expect(await householdEventCount(householdId)).toBe(before);
  });

  test("rename_location writes place_renamed with the old path; same name is a no-op; a duplicate is refused", async () => {
    const office = await seedLocation(householdId, "Office");
    const cabinet = await seedLocation(householdId, "Cabinet", office);
    await seedLocation(householdId, "Filing cabinet", office);

    const same = await clientOwner.rpc("rename_location", { p_location_id: cabinet, p_name: " Cabinet " });
    expect(same.error).toBeNull();
    expect(await eventsFor(cabinet)).toHaveLength(0);

    const clash = await clientOwner.rpc("rename_location", { p_location_id: cabinet, p_name: "FILING CABINET" });
    expect(clash.error?.code).toBe("23505");
    expect(await eventsFor(cabinet)).toHaveLength(0);

    const renamed = await clientPartner.rpc("rename_location", { p_location_id: cabinet, p_name: "Drawer unit" });
    expect(renamed.error).toBeNull();
    expect(renamed.data?.name).toBe("Drawer unit");

    const events = await eventsFor(cabinet);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "place_renamed",
      actor_id: partner.userId,
      subject_name: "Drawer unit",
      from_text: "Office › Cabinet",
      to_text: "Drawer unit",
    });
  });

  test("move_container writes place_moved with old/new parent paths and keeps cycle prevention", async () => {
    const garage = await seedLocation(householdId, "Garage");
    const bedroom = await seedLocation(householdId, "Bedroom");
    const underBed = await seedLocation(householdId, "Under bed", bedroom);
    const box = await seedLocation(householdId, "Camping box", garage);

    const { error } = await clientOwner.rpc("move_container", { p_location_id: box, p_new_parent_id: underBed });
    expect(error).toBeNull();

    // Omitting the parent means "top level" (the parameter defaults to null).
    const toTop = await clientOwner.rpc("move_container", { p_location_id: box });
    expect(toTop.error).toBeNull();

    const events = await eventsFor(box);
    expect(kinds(events)).toEqual(["place_moved", "place_moved"]);
    expect(events[0]).toMatchObject({
      from_text: "Garage",
      to_text: "Bedroom › Under bed",
      subject_name: "Camping box",
    });
    expect(events[1]).toMatchObject({ from_text: "Bedroom › Under bed", to_text: null });

    // A place can't go inside its own descendant — and a refusal writes nothing.
    const before = await householdEventCount(householdId);
    const cycle = await clientOwner.rpc("move_container", { p_location_id: bedroom, p_new_parent_id: underBed });
    expect(cycle.error?.message).toMatch(/move_container:.*own descendant/i);
    expect(await householdEventCount(householdId)).toBe(before);
  });

  test("delete_container writes place_deleted, is still blocked while non-empty, and a blocked delete writes nothing", async () => {
    const office = await seedLocation(householdId, "Study 2");
    const drawer = await seedLocation(householdId, "Bottom drawer", office);
    const { data: item } = await clientOwner.rpc("stash_item", { p_name: "Receipts", p_location_id: drawer });

    const before = await householdEventCount(householdId);
    const blockedItems = await clientOwner.rpc("delete_container", { p_location_id: drawer });
    expect(blockedItems.error?.message).toMatch(/delete_container:.*has items/i);
    const blockedChildren = await clientOwner.rpc("delete_container", { p_location_id: office });
    expect(blockedChildren.error?.message).toMatch(/delete_container:.*child locations/i);
    expect(await householdEventCount(householdId)).toBe(before);

    await clientOwner.rpc("delete_item", { p_item_id: item?.id ?? "" });
    const { error } = await clientPartner.rpc("delete_container", { p_location_id: drawer });
    expect(error).toBeNull();

    const events = await eventsFor(drawer);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "place_deleted",
      actor_id: partner.userId,
      subject_name: "Bottom drawer",
      from_text: "Study 2",
    });
  });

  test("authorization: a member of household A can't drive any writer against household B's rows", async () => {
    const theirPlace = await seedLocation(otherHouseholdId, "Their cellar");
    const theirItem = await clientOutsider.rpc("stash_item", { p_name: "Their wine", p_location_id: theirPlace });
    const theirItemId = theirItem.data?.id ?? "";
    const theirEventsBefore = await householdEventCount(otherHouseholdId);

    const attempts = [
      clientOwner.rpc("move_item", { p_item_id: theirItemId, p_new_location_id: theirPlace }),
      clientOwner.rpc("update_item", { p_item_id: theirItemId, p_name: "Hijacked" }),
      clientOwner.rpc("delete_item", { p_item_id: theirItemId }),
      clientOwner.rpc("rename_location", { p_location_id: theirPlace, p_name: "Hijacked" }),
      clientOwner.rpc("move_container", { p_location_id: theirPlace, p_new_parent_id: theirPlace }),
      clientOwner.rpc("delete_container", { p_location_id: theirPlace }),
      clientOwner.rpc("create_location", { p_name: "Sneaky", p_parent_id: theirPlace }),
      clientOwner.rpc("stash_item", { p_name: "Sneaky", p_location_id: theirPlace }),
    ];
    for (const result of await Promise.all(attempts)) {
      expect(result.error).not.toBeNull();
    }

    // Nothing changed and no event was written for household B.
    const { data: row } = await serviceClient.from("items").select("name").eq("id", theirItemId).single();
    expect(row?.name).toBe("Their wine");
    expect(await householdEventCount(otherHouseholdId)).toBe(theirEventsBefore);
  });

  test("anon can't call any writer", async () => {
    const id = randomUUID();
    const results = await Promise.all([
      anonClient.rpc("stash_item", { p_name: "x", p_new_path: ["y"] }),
      anonClient.rpc("move_item", { p_item_id: id, p_new_path: ["y"] }),
      anonClient.rpc("update_item", { p_item_id: id, p_name: "x" }),
      anonClient.rpc("delete_item", { p_item_id: id }),
      anonClient.rpc("create_location", { p_name: "x" }),
      anonClient.rpc("rename_location", { p_location_id: id, p_name: "x" }),
      anonClient.rpc("move_container", { p_location_id: id, p_new_parent_id: id }),
      anonClient.rpc("delete_container", { p_location_id: id }),
    ]);
    for (const result of results) {
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    }
  });

  test("direct client INSERT/UPDATE/DELETE on items, locations and activity_events are refused", async () => {
    const place = await seedLocation(householdId, "Locked place");
    const { data: item } = await clientOwner.rpc("stash_item", { p_name: "Locked item", p_location_id: place });
    const itemId = item?.id ?? "";

    const results = await Promise.all([
      clientOwner
        .from("items")
        .insert({ household_id: householdId, location_id: place, name: "Direct", added_by: owner.userId }),
      clientOwner.from("items").update({ name: "Direct" }).eq("id", itemId),
      clientOwner.from("items").delete().eq("id", itemId),
      clientOwner.from("locations").insert({ household_id: householdId, name: "Direct" }),
      clientOwner.from("locations").update({ name: "Direct" }).eq("id", place),
      clientOwner.from("locations").delete().eq("id", place),
      clientOwner.from("activity_events").insert({
        household_id: householdId,
        actor_id: owner.userId,
        kind: "item_added",
        subject_id: itemId,
        subject_name: "Forged",
      }),
      clientOwner.from("activity_events").update({ subject_name: "Forged" }).eq("subject_id", itemId),
      clientOwner.from("activity_events").delete().eq("subject_id", itemId),
    ]);
    // Refused by privilege (42501), not filtered to zero rows by RLS.
    for (const result of results) {
      expect(result.error?.code).toBe(PERMISSION_DENIED);
    }

    const { data: untouched } = await serviceClient.from("items").select("name").eq("id", itemId).single();
    expect(untouched?.name).toBe("Locked item");
    expect(kinds(await eventsFor(itemId))).toEqual(["item_added"]);
  });

  test("members read their household's events and nobody else's", async () => {
    const mine = await clientPartner.from("activity_events").select("household_id").limit(500);
    expect(mine.error).toBeNull();
    expect((mine.data ?? []).length).toBeGreaterThan(0);
    expect(new Set((mine.data ?? []).map((row) => row.household_id))).toEqual(new Set([householdId]));

    const anon = await anonClient.from("activity_events").select("id").limit(1);
    expect(anon.error?.code).toBe(PERMISSION_DENIED);
  });
});
