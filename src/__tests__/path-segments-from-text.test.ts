import { expect, test } from "vitest";
import { pathSegmentsFromText } from "@/lib/activity";

test("splits an event's path snapshot on › and trims each name", () => {
  expect(pathSegmentsFromText("Garage › Closet ›  Toolbox ").map((segment) => segment.name)).toEqual([
    "Garage",
    "Closet",
    "Toolbox",
  ]);
});

test("ids are unique even when two places share a name at different depths", () => {
  const ids = pathSegmentsFromText("Box › Box").map((segment) => segment.id);
  expect(new Set(ids).size).toBe(2);
});

test("a missing or blank snapshot is an empty path", () => {
  expect(pathSegmentsFromText(null)).toEqual([]);
  expect(pathSegmentsFromText("")).toEqual([]);
  expect(pathSegmentsFromText(" › ")).toEqual([]);
});
