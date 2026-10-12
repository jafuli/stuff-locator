import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// "server-only" throws outside React's server build; the service under test
// takes its client as a parameter, so a stub import is all that's needed.
vi.mock("server-only", () => ({}));

import { fetchActivityEntries } from "@/server/services/activity";

interface Result {
  data: unknown;
  error: { message: string } | null;
}

// A chainable, awaitable stand-in for a PostgREST query builder: every
// filter method returns the same object, and awaiting it (or calling
// maybeSingle) resolves to the table's canned result.
function query(result: Result) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "in"]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

interface Tables {
  household_members?: Result;
  items?: Result;
  locations?: Result;
  profiles?: Result;
}

function fakeClient(tables: Tables): SupabaseClient<Database> {
  const empty: Result = { data: [], error: null };
  const from = vi.fn((table: keyof Tables) => query(tables[table] ?? empty));
  return { from } as unknown as SupabaseClient<Database>;
}

const ok = (data: unknown): Result => ({ data, error: null });

const MEMBERSHIP = ok({ household_id: "h1" });
const LOCATIONS = ok([
  { id: "garage", parent_id: null, name: "Garage" },
  { id: "shelf", parent_id: "garage", name: "Shelf" },
]);
const PROFILES = ok([
  { user_id: "u-itamar", display_name: "Itamar" },
  { user_id: "u-maayan", display_name: "Maayan" },
]);

describe("fetchActivityEntries", () => {
  test("turns an item's add and a later move into two entries, newest first, with display names and breadcrumbs", async () => {
    const client = fakeClient({
      household_members: MEMBERSHIP,
      locations: LOCATIONS,
      profiles: PROFILES,
      items: ok([
        {
          id: "i1",
          location_id: "shelf",
          name: "Spare keys",
          added_by: "u-itamar",
          added_at: "2026-10-01T10:00:00Z",
          last_moved_by: "u-maayan",
          last_moved_at: "2026-10-05T10:00:00Z",
        },
      ]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries.map(({ event }) => [event.verb, event.actor])).toEqual([
      ["moved", "Maayan"],
      ["added", "Itamar"],
    ]);
    expect(entries[0].event.item.name).toBe("Spare keys");
    expect(entries[0].segments.map((segment) => segment.name)).toEqual(["Garage", "Shelf"]);
  });

  test("an item that was never moved produces only its add", async () => {
    const client = fakeClient({
      household_members: MEMBERSHIP,
      locations: LOCATIONS,
      profiles: PROFILES,
      items: ok([
        {
          id: "i1",
          location_id: "garage",
          name: "Tent",
          added_by: "u-itamar",
          added_at: "2026-10-01T10:00:00Z",
          last_moved_by: null,
          last_moved_at: "2026-10-01T10:00:00Z",
        },
      ]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries).toHaveLength(1);
    expect(entries[0].event.verb).toBe("added");
  });

  test("a user with no readable profile shows as 'Someone', never as a raw id", async () => {
    const client = fakeClient({
      household_members: MEMBERSHIP,
      locations: LOCATIONS,
      profiles: ok([]),
      items: ok([
        {
          id: "i1",
          location_id: "garage",
          name: "Tent",
          added_by: "u-gone",
          added_at: "2026-10-01T10:00:00Z",
          last_moved_by: null,
          last_moved_at: null,
        },
      ]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries[0].event.actor).toBe("Someone");
  });

  test("a household with no items yields an empty feed", async () => {
    const client = fakeClient({ household_members: MEMBERSHIP, items: ok([]), locations: ok([]) });
    expect(await fetchActivityEntries(client, "u-itamar")).toEqual([]);
  });

  test("throws when the caller has no household", async () => {
    const client = fakeClient({ household_members: ok(null) });
    await expect(fetchActivityEntries(client, "u-itamar")).rejects.toThrow("no household");
  });

  test.each(["household_members", "items", "locations", "profiles"] as const)(
    "surfaces a %s read error so the route's error boundary shows",
    async (table) => {
      const client = fakeClient({
        household_members: MEMBERSHIP,
        locations: LOCATIONS,
        profiles: PROFILES,
        items: ok([
          {
            id: "i1",
            location_id: "garage",
            name: "Tent",
            added_by: "u-itamar",
            added_at: "2026-10-01T10:00:00Z",
            last_moved_by: null,
            last_moved_at: null,
          },
        ]),
        [table]: { data: null, error: { message: `${table} failed` } },
      });

      await expect(fetchActivityEntries(client, "u-itamar")).rejects.toThrow(`${table} failed`);
    },
  );
});
