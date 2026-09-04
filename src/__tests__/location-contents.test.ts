import { expect, test } from "vitest";
import {
  getChildLocations,
  getItemsInLocation,
  getLocationContents,
  getRootLocations,
} from "@/lib/fixtures/location-contents";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";

test("getRootLocations returns only the top-level (parentId === null) locations, in fixture order", () => {
  const roots = getRootLocations(LOCATIONS);
  expect(roots.map((location) => location.id)).toEqual(["garage", "office", "bedroom", "kitchen"]);
});

test("root location: has child locations but no items stored directly in it", () => {
  const contents = getLocationContents("garage", LOCATIONS, ITEMS);
  expect(contents.childLocations.map((location) => location.id)).toEqual([
    "garage-high-shelf",
    "garage-closet",
    "garage-behind-the-bikes",
  ]);
  expect(contents.items).toEqual([]);
});

test("mid-tree location: has one child location and no items directly in it", () => {
  const contents = getLocationContents("garage-closet-toolbox", LOCATIONS, ITEMS);
  expect(contents.childLocations.map((location) => location.id)).toEqual(["garage-closet-toolbox-red-box"]);
  expect(contents.items).toEqual([]);
});

test("leaf location with nothing in it: no children and no items", () => {
  const contents = getLocationContents("garage-behind-the-bikes", LOCATIONS, ITEMS);
  expect(contents.childLocations).toEqual([]);
  expect(contents.items).toEqual([]);
});

test("leaf location with items: no children, but items stored directly in it", () => {
  const contents = getLocationContents("garage-closet-toolbox-red-box", LOCATIONS, ITEMS);
  expect(contents.childLocations).toEqual([]);
  expect(contents.items.map((item) => item.id)).toEqual(["spare-house-keys", "bike-multi-tool"]);
});

test("getChildLocations and getItemsInLocation agree with getLocationContents", () => {
  const locationId = "office";
  expect(getChildLocations(locationId, LOCATIONS)).toEqual(getLocationContents(locationId, LOCATIONS, ITEMS).childLocations);
  expect(getItemsInLocation(locationId, ITEMS)).toEqual(getLocationContents(locationId, LOCATIONS, ITEMS).items);
});
