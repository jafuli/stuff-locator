import { expect, test } from "vitest";
import { filterItems } from "@/lib/fixtures/search";
import type { Item } from "@/lib/fixtures/types";

const items: Item[] = [
  { id: "passport", locationId: "bedroom-filing-box", name: "Passport", detail: "with the birth certificates" },
  { id: "camping-tent", locationId: "garage-high-shelf", name: "Camping tent" },
];

test("an empty query returns every item unfiltered", () => {
  expect(filterItems(items, "")).toEqual(items);
});

test("a whitespace-only query returns every item unfiltered", () => {
  expect(filterItems(items, "   ")).toEqual(items);
});

test("matches by item name", () => {
  expect(filterItems(items, "tent")).toEqual([items[1]]);
});

test("matches by the free-text detail field, not just the name", () => {
  expect(filterItems(items, "birth certificates")).toEqual([items[0]]);
});

test("a query matching nothing returns an empty list", () => {
  expect(filterItems(items, "nonexistent")).toEqual([]);
});

test("matching is case-insensitive", () => {
  expect(filterItems(items, "PASSPORT")).toEqual([items[0]]);
  expect(filterItems(items, "BIRTH")).toEqual([items[0]]);
});
