import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEFAULT_HOUSEHOLD_NAME, deriveHouseholdName, ensureHousehold } from "@/server/services/household";

// Hand-built fake client rather than vi.mock("@/server/db/...") — ensureHousehold
// takes its client as a parameter specifically so it's testable this way,
// with no module mocking required (see the doc comment on ensureHousehold).
function fakeClient(options: {
  existing?: { household_id: string }[];
  readError?: { message: string } | null;
  displayName?: string | null;
  createError?: { message: string; code?: string } | null;
}): { client: SupabaseClient<Database>; rpc: ReturnType<typeof vi.fn> } {
  const memberships = {
    select: () => ({
      eq: () => ({
        limit: vi.fn().mockResolvedValue({ data: options.existing ?? [], error: options.readError ?? null }),
      }),
    }),
  };
  const profiles = {
    select: () => ({
      eq: () => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: options.displayName === null ? null : { display_name: options.displayName ?? "Jane Doe" },
          error: null,
        }),
      }),
    }),
  };
  const from = vi.fn((table: string) => (table === "profiles" ? profiles : memberships));
  const rpc = vi.fn().mockResolvedValue({ data: null, error: options.createError ?? null });

  return { client: { from, rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("deriveHouseholdName", () => {
  test("is the founder's first name, possessive", () => {
    expect(deriveHouseholdName("Itamar Badash")).toBe("Itamar's household");
    expect(deriveHouseholdName("  Noa  ")).toBe("Noa's household");
  });

  test("works for a seeded email handle too (people who signed up before the name field)", () => {
    expect(deriveHouseholdName("jane.doe")).toBe("jane.doe's household");
  });

  test("is clamped to the household-name limit (50)", () => {
    const name = deriveHouseholdName("a".repeat(50));
    expect(Array.from(name)).toHaveLength(50);
    expect(name.startsWith("a".repeat(50))).toBe(true);
  });

  test.each([null, undefined, "", "   "])("falls back to the default name for %j", (displayName) => {
    expect(deriveHouseholdName(displayName)).toBe(DEFAULT_HOUSEHOLD_NAME);
  });
});

describe("ensureHousehold", () => {
  test("creates a household when the user has none, named from their display name", async () => {
    const { client, rpc } = fakeClient({ existing: [], displayName: "Jane Doe" });

    const result = await ensureHousehold(client, "user-1");

    expect(result).toEqual({ ok: true, created: true });
    expect(rpc).toHaveBeenCalledWith("create_household", { p_name: "Jane's household" });
  });

  test("an unreadable profile still gets a household, under the default name", async () => {
    const { client, rpc } = fakeClient({ existing: [], displayName: null });

    await ensureHousehold(client, "user-1");

    expect(rpc).toHaveBeenCalledWith("create_household", { p_name: DEFAULT_HOUSEHOLD_NAME });
  });

  test("does not create a second household when the user already has one", async () => {
    const { client, rpc } = fakeClient({ existing: [{ household_id: "h1" }] });

    const result = await ensureHousehold(client, "user-1");

    expect(result).toEqual({ ok: true, created: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("surfaces a membership-read error without attempting to create", async () => {
    const { client, rpc } = fakeClient({ readError: { message: "read failed" } });

    const result = await ensureHousehold(client, "user-1");

    expect(result).toEqual({ ok: false, error: "read failed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("surfaces a create_household error", async () => {
    const { client } = fakeClient({ existing: [], createError: { message: "create_household: boom" } });

    const result = await ensureHousehold(client, "user-1");

    expect(result).toEqual({ ok: false, error: "create_household: boom" });
  });

  test("treats SL004 (already in a household — a concurrent bootstrap won) as success, not an error", async () => {
    const { client } = fakeClient({
      existing: [],
      createError: { message: "create_household: the caller already belongs to a household", code: "SL004" },
    });

    const result = await ensureHousehold(client, "user-1");

    expect(result).toEqual({ ok: true, created: false });
  });
});
