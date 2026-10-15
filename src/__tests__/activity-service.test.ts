import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// "server-only" throws outside React's server build; the service under test
// takes its client as a parameter, so a stub import is all that's needed.
vi.mock("server-only", () => ({}));

import { ACTIVITY_FEED_LIMIT, fetchActivityEntries } from "@/server/services/activity";

interface Result {
  data: unknown;
  error: { message: string } | null;
}

type Builder = Record<string, unknown>;

// A chainable, awaitable stand-in for a PostgREST query builder: every
// filter method returns the same object and is recorded, and awaiting it (or
// calling maybeSingle) resolves to the table's canned result.
function query(result: Result): Builder {
  const builder: Builder = {};
  for (const method of ["select", "eq", "order", "limit", "in"]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

interface Tables {
  household_members?: Result;
  activity_events?: Result;
  profiles?: Result;
}

function fakeClient(tables: Tables) {
  const empty: Result = { data: [], error: null };
  const builders: Partial<Record<keyof Tables, Builder>> = {};
  const from = vi.fn((table: keyof Tables) => {
    const builder = query(tables[table] ?? empty);
    builders[table] = builder;
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient<Database>, from, builders };
}

const ok = (data: unknown): Result => ({ data, error: null });

const MEMBERSHIP = ok({ household_id: "h1" });
const PROFILES = ok([
  { user_id: "u-itamar", display_name: "Itamar" },
  { user_id: "u-maayan", display_name: "Maayan" },
]);

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    household_id: "h1",
    actor_id: "u-itamar",
    kind: "item_added",
    subject_id: "i1",
    subject_name: "Spare keys",
    from_text: null,
    to_text: "Garage › Shelf",
    detail_text: null,
    created_at: "2026-10-05T10:00:00Z",
    ...overrides,
  };
}

describe("fetchActivityEntries", () => {
  test("maps events to entries with display names, in the order the database returned (newest first)", async () => {
    const { client } = fakeClient({
      household_members: MEMBERSHIP,
      profiles: PROFILES,
      activity_events: ok([
        eventRow({
          id: "e2",
          actor_id: "u-maayan",
          kind: "item_moved",
          from_text: "Garage › Shelf",
          to_text: "Attic",
          created_at: "2026-10-06T10:00:00Z",
        }),
        eventRow({ id: "e1" }),
      ]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries.map((entry) => [entry.id, entry.kind, entry.actor])).toEqual([
      ["e2", "item_moved", "Maayan"],
      ["e1", "item_added", "Itamar"],
    ]);
    expect(entries[0]).toMatchObject({
      subjectId: "i1",
      subjectName: "Spare keys",
      fromText: "Garage › Shelf",
      toText: "Attic",
    });
    expect(entries[0]?.at).toEqual(new Date("2026-10-06T10:00:00Z"));
  });

  test("reads only activity_events, scoped to the caller's household, newest first, capped", async () => {
    const { client, from, builders } = fakeClient({
      household_members: MEMBERSHIP,
      profiles: PROFILES,
      activity_events: ok([eventRow()]),
    });

    await fetchActivityEntries(client, "u-itamar");

    // The provenance-derived reads are gone: items and locations are never touched.
    expect(from.mock.calls.map(([table]) => table)).toEqual(["household_members", "activity_events", "profiles"]);

    const events = builders.activity_events;
    expect(events?.eq).toHaveBeenCalledWith("household_id", "h1");
    expect(events?.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(events?.limit).toHaveBeenCalledWith(ACTIVITY_FEED_LIMIT);
    expect(ACTIVITY_FEED_LIMIT).toBe(100);
  });

  test("uses the caller's oldest membership, the same rule as Home", async () => {
    const { client, builders } = fakeClient({ household_members: MEMBERSHIP, activity_events: ok([]) });

    await fetchActivityEntries(client, "u-itamar");

    const members = builders.household_members;
    expect(members?.eq).toHaveBeenCalledWith("user_id", "u-itamar");
    expect(members?.order).toHaveBeenCalledWith("joined_at", { ascending: true });
  });

  test("an actor with no readable profile, or none at all, shows as 'Someone', never a raw id", async () => {
    const { client } = fakeClient({
      household_members: MEMBERSHIP,
      profiles: ok([]),
      activity_events: ok([eventRow({ id: "e1", actor_id: "u-gone" }), eventRow({ id: "e2", actor_id: null })]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries.map((entry) => entry.actor)).toEqual(["Someone", "Someone"]);
    expect(JSON.stringify(entries)).not.toContain("u-gone");
  });

  test("a kind this build doesn't know is skipped rather than failing the whole feed", async () => {
    const { client } = fakeClient({
      household_members: MEMBERSHIP,
      profiles: PROFILES,
      activity_events: ok([eventRow({ id: "e1", kind: "item_teleported" }), eventRow({ id: "e2" })]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries.map((entry) => entry.id)).toEqual(["e2"]);
  });

  test("an item moved three times is three entries", async () => {
    const { client } = fakeClient({
      household_members: MEMBERSHIP,
      profiles: PROFILES,
      activity_events: ok([
        eventRow({ id: "m3", kind: "item_moved", from_text: "C", to_text: "D" }),
        eventRow({ id: "m2", kind: "item_moved", from_text: "B", to_text: "C" }),
        eventRow({ id: "m1", kind: "item_moved", from_text: "A", to_text: "B" }),
      ]),
    });

    const entries = await fetchActivityEntries(client, "u-itamar");

    expect(entries.map((entry) => `${entry.fromText ?? ""}→${entry.toText ?? ""}`)).toEqual(["C→D", "B→C", "A→B"]);
  });

  test("a household with no events yields an empty feed", async () => {
    const { client } = fakeClient({ household_members: MEMBERSHIP, activity_events: ok([]) });
    expect(await fetchActivityEntries(client, "u-itamar")).toEqual([]);
  });

  test("throws when the caller has no household", async () => {
    const { client } = fakeClient({ household_members: ok(null) });
    await expect(fetchActivityEntries(client, "u-itamar")).rejects.toThrow("no household");
  });

  test.each(["household_members", "activity_events", "profiles"] as const)(
    "surfaces a %s read error so the route's error boundary shows",
    async (table) => {
      const { client } = fakeClient({
        household_members: MEMBERSHIP,
        profiles: PROFILES,
        activity_events: ok([eventRow()]),
        [table]: { data: null, error: { message: `${table} failed` } },
      });

      await expect(fetchActivityEntries(client, "u-itamar")).rejects.toThrow(`${table} failed`);
    },
  );
});
