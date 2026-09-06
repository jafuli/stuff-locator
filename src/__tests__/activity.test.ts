import { expect, test } from "vitest";
import { getActivityEvents } from "@/lib/fixtures/activity";
import type { Item } from "@/lib/fixtures/types";

const baseItem: Item = {
  id: "test-item",
  locationId: "garage",
  name: "Test item",
};

test("an item with only add provenance emits one 'added' event", () => {
  const item: Item = { ...baseItem, addedBy: "Itamar", addedAt: new Date("2026-01-01T00:00:00Z") };
  const events = getActivityEvents([item]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ verb: "added", actor: "Itamar", item });
});

test("an item with both add and a genuinely later move emits both events, newest first", () => {
  const item: Item = {
    ...baseItem,
    addedBy: "Itamar",
    addedAt: new Date("2026-01-01T00:00:00Z"),
    lastMovedBy: "Maayan",
    lastMovedAt: new Date("2026-01-10T00:00:00Z"),
  };
  const events = getActivityEvents([item]);

  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({ verb: "moved", actor: "Maayan" });
  expect(events[1]).toMatchObject({ verb: "added", actor: "Itamar" });
});

test("an item whose move fields don't represent a real distinct move emits only the add event", () => {
  // Mirrors the real fixture shape: lastMovedAt initialized to addedAt at
  // creation time, no lastMovedBy — never actually moved since creation.
  const sameTimestamp = new Date("2026-01-01T00:00:00Z");
  const item: Item = { ...baseItem, addedBy: "Itamar", addedAt: sameTimestamp, lastMovedAt: sameTimestamp };
  const events = getActivityEvents([item]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ verb: "added" });
});

test("an item whose lastMovedAt predates addedAt is not treated as a distinct move", () => {
  const item: Item = {
    ...baseItem,
    addedBy: "Itamar",
    addedAt: new Date("2026-01-10T00:00:00Z"),
    lastMovedBy: "Maayan",
    lastMovedAt: new Date("2026-01-01T00:00:00Z"),
  };
  const events = getActivityEvents([item]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ verb: "added" });
});

test("an empty item list produces an empty event list", () => {
  expect(getActivityEvents([])).toEqual([]);
});
