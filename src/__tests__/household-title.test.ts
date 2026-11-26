import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { householdTitle, readHouseholdIdentity } from "@/lib/household-title";

describe("householdTitle", () => {
  test("an unnamed household is the owner's first name plus 's household", () => {
    expect(householdTitle({ name: null, ownerDisplayName: "Noa Levi" })).toBe("Noa's household");
    expect(householdTitle({ name: null, ownerDisplayName: "jane.doe" })).toBe("jane.doe's household");
  });

  test("a 50-character first name keeps the whole suffix: nothing is clamped, nothing is stored", () => {
    const longName = "w".repeat(50);
    expect(householdTitle({ name: null, ownerDisplayName: longName })).toBe(`${longName}'s household`);
  });

  test("a chosen name wins over the owner's", () => {
    expect(householdTitle({ name: "Shared home", ownerDisplayName: "Noa" })).toBe("Shared home");
  });

  test("a blank chosen name counts as no name", () => {
    expect(householdTitle({ name: "  ", ownerDisplayName: "Noa" })).toBe("Noa's household");
  });

  test("null when neither is known, so each screen picks its own wording", () => {
    expect(householdTitle({ name: null, ownerDisplayName: null })).toBeNull();
    expect(householdTitle({ name: null, ownerDisplayName: "   " })).toBeNull();
  });
});

function fakeClient(household: unknown, profile: unknown) {
  const maybeSingleHousehold = vi.fn().mockResolvedValue({ data: household });
  const householdQuery = {
    eq: vi.fn(() => householdQuery),
    limit: vi.fn(() => ({ maybeSingle: maybeSingleHousehold })),
  };
  const profileQuery = {
    eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: profile }) })),
  };
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => (table === "households" ? householdQuery : profileQuery)),
  }));
  return { client: { from } as unknown as SupabaseClient<Database>, householdQuery, from };
}

describe("readHouseholdIdentity", () => {
  test("reads the owner's profile, not the partner's", async () => {
    const { client, from } = fakeClient(
      {
        name: null,
        household_members: [
          { user_id: "partner", role: "member" },
          { user_id: "owner", role: "owner" },
        ],
      },
      { display_name: "Noa Levi" },
    );
    await expect(readHouseholdIdentity(client)).resolves.toEqual({ name: null, ownerDisplayName: "Noa Levi" });
    expect(from).toHaveBeenCalledWith("profiles");
  });

  test("filters by id when given one", async () => {
    const { client, householdQuery } = fakeClient({ name: "Shared home", household_members: [] }, null);
    await expect(readHouseholdIdentity(client, "h1")).resolves.toEqual({
      name: "Shared home",
      ownerDisplayName: null,
    });
    expect(householdQuery.eq).toHaveBeenCalledWith("id", "h1");
  });

  test("null when the household can't be read", async () => {
    const { client } = fakeClient(null, null);
    await expect(readHouseholdIdentity(client)).resolves.toBeNull();
  });
});
