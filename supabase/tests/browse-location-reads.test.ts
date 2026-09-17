// Integration test for the real read shapes Browse now uses
// (src/app/browse/page.tsx's top-level-location read, and
// src/app/browse/[id]/page.tsx's immediate-child-location read + the
// location_subtree_items RPC used together) — NOT part of `npm run test`
// (see vitest.config.mts's exclude). Requires a running local Supabase
// stack with every migration through
// 20260914110000_location_subtree_items_rpc.sql applied:
//
//   npm run supabase:start
//   npx supabase status -o env   # prints API_URL/ANON_KEY/SERVICE_ROLE_KEY
//   npm run test:rls
//
// `npm run test:rls` auto-loads SUPABASE_URL/SUPABASE_ANON_KEY/
// SUPABASE_SERVICE_ROLE_KEY from a gitignored .env.rls.local (see
// items-insert.test.ts for the same shortcut) if you've written one;
// otherwise export them yourself before running this.
//
// The RPC itself is already covered in isolation by
// location-subtree-items-rpc.test.ts — this file instead proves the
// specific combination Browse's own pages rely on: a targeted top-level
// read, a targeted immediate-children read, and the subtree RPC, all
// exercised together against one real multi-level hierarchy, plus the
// empty-subtree case this task's AC calls out explicitly.
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

async function createHousehold(name: string): Promise<string> {
  const { data, error } = await serviceClient.from("households").insert({ name }).select().single();
  if (error) {
    throw new Error(`failed to create household "${name}": ${error.message}`);
  }
  return data.id;
}

async function createTestUser(label: string): Promise<{ userId: string; email: string; password: string }> {
  const email = `browse-reads-test-${label}-${randomUUID()}@example.com`;
  const password = "a-long-enough-test-password-1!";
  const { data, error } = await serviceClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    throw new Error(`failed to create test user "${label}": ${error.message}`);
  }
  return { userId: data.user.id, email, password };
}

async function addMember(householdId: string, userId: string) {
  const { error } = await serviceClient
    .from("household_members")
    .insert({ household_id: householdId, user_id: userId, role: "owner" });
  if (error) {
    throw new Error(`failed to add member ${userId} to ${householdId}: ${error.message}`);
  }
}

async function createLocation(householdId: string, name: string, parentId: string | null = null): Promise<string> {
  const { data, error } = await serviceClient
    .from("locations")
    .insert({ household_id: householdId, name, parent_id: parentId })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to create location "${name}": ${error.message}`);
  }
  return data.id;
}

async function createItem(householdId: string, locationId: string, addedBy: string, name: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("items")
    .insert({ household_id: householdId, location_id: locationId, name, added_by: addedBy })
    .select()
    .single();
  if (error) {
    throw new Error(`failed to create item "${name}": ${error.message}`);
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

describe("Browse real reads (top-level list, immediate children, subtree items)", () => {
  let householdId: string;
  let owner: { userId: string; email: string; password: string };
  let clientOwner: SupabaseClient<Database>;

  let garageId: string;
  let closetId: string;
  let toolboxId: string;
  let officeId: string; // sibling root, own item
  let atticId: string; // root, empty subtree

  beforeAll(async () => {
    householdId = await createHousehold("browse reads test household");
    owner = await createTestUser("owner");
    await addMember(householdId, owner.userId);
    clientOwner = await signInAs(owner.email, owner.password);

    // Garage -> Closet -> Toolbox, one item at each level.
    garageId = await createLocation(householdId, "Garage");
    closetId = await createLocation(householdId, "Closet", garageId);
    toolboxId = await createLocation(householdId, "Toolbox", closetId);
    await createItem(householdId, garageId, owner.userId, "Garage item");
    await createItem(householdId, closetId, owner.userId, "Closet item");
    await createItem(householdId, toolboxId, owner.userId, "Toolbox item");

    // A sibling root, NOT a descendant of Garage, with its own item.
    officeId = await createLocation(householdId, "Office");
    await createItem(householdId, officeId, owner.userId, "Office item");

    // A root location with nothing anywhere in its subtree.
    atticId = await createLocation(householdId, "Attic");
  }, 30_000);

  afterAll(async () => {
    await serviceClient.from("households").delete().eq("id", householdId);
    await serviceClient.auth.admin.deleteUser(owner.userId);
  });

  test("the top-level location list (parent_id is null) returns only the roots, not deeper descendants", async () => {
    const { data, error } = await clientOwner
      .from("locations")
      .select("id, parent_id, name")
      .eq("household_id", householdId)
      .is("parent_id", null);

    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id).sort();
    expect(ids).toEqual([garageId, officeId, atticId].sort());
  });

  test("a mid-tree location's immediate-child-location read returns only its direct child, not its grandchild", async () => {
    const { data, error } = await clientOwner
      .from("locations")
      .select("id, parent_id, name")
      .eq("household_id", householdId)
      .eq("parent_id", garageId);

    expect(error).toBeNull();
    expect((data ?? []).map((row) => row.id)).toEqual([closetId]);
  });

  test("the subtree RPC for a root returns every nested item, excluding a sibling root's", async () => {
    const { data, error } = await clientOwner.rpc("location_subtree_items", { p_location_id: garageId });

    expect(error).toBeNull();
    const names = (data ?? []).map((item) => item.name).sort();
    expect(names).toEqual(["Closet item", "Garage item", "Toolbox item"].sort());
    expect(names).not.toContain("Office item");
  });

  test("a location with no child locations and no items anywhere in its subtree returns empty results for both reads", async () => {
    const [childrenResult, subtreeResult] = await Promise.all([
      clientOwner.from("locations").select("id").eq("household_id", householdId).eq("parent_id", atticId),
      clientOwner.rpc("location_subtree_items", { p_location_id: atticId }),
    ]);

    expect(childrenResult.error).toBeNull();
    expect(childrenResult.data).toHaveLength(0);
    expect(subtreeResult.error).toBeNull();
    expect(subtreeResult.data).toHaveLength(0);
  });
});
