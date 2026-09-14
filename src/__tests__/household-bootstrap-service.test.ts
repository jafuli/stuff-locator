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
  createError?: { message: string } | null;
}): { client: SupabaseClient<Database>; rpc: ReturnType<typeof vi.fn> } {
  const limit = vi.fn().mockResolvedValue({
    data: options.existing ?? [],
    error: options.readError ?? null,
  });
  const eq = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: options.createError ?? null });

  return { client: { from, rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("deriveHouseholdName", () => {
  test("uses the email local-part", () => {
    expect(deriveHouseholdName("jane@example.com")).toBe("jane");
  });

  test("trims whitespace around the local-part", () => {
    expect(deriveHouseholdName("  jane  @example.com")).toBe("jane");
  });

  test.each([null, undefined, "", "   ", "@example.com"])(
    "falls back to the default name for %j",
    (email) => {
      expect(deriveHouseholdName(email)).toBe(DEFAULT_HOUSEHOLD_NAME);
    },
  );
});

describe("ensureHousehold", () => {
  test("creates a household when the user has none, deriving the name from their email", async () => {
    const { client, rpc } = fakeClient({ existing: [] });

    const result = await ensureHousehold(client, "user-1", "jane@example.com");

    expect(result).toEqual({ ok: true, created: true });
    expect(rpc).toHaveBeenCalledWith("create_household", { p_name: "jane" });
  });

  test("does not create a second household when the user already has one", async () => {
    const { client, rpc } = fakeClient({ existing: [{ household_id: "h1" }] });

    const result = await ensureHousehold(client, "user-1", "jane@example.com");

    expect(result).toEqual({ ok: true, created: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("surfaces a membership-read error without attempting to create", async () => {
    const { client, rpc } = fakeClient({ readError: { message: "read failed" } });

    const result = await ensureHousehold(client, "user-1", "jane@example.com");

    expect(result).toEqual({ ok: false, error: "read failed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("surfaces a create_household error", async () => {
    const { client } = fakeClient({ existing: [], createError: { message: "create_household: boom" } });

    const result = await ensureHousehold(client, "user-1", "jane@example.com");

    expect(result).toEqual({ ok: false, error: "create_household: boom" });
  });
});
