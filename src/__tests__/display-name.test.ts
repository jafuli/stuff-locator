import { expect, test } from "vitest";
import { UNKNOWN_DISPLAY_NAME, displayNameFor } from "@/lib/display-name";

const NAMES = new Map([
  ["11111111-1111-4111-8111-111111111111", "jane"],
  ["22222222-2222-4222-8222-222222222222", "sam"],
]);

test("resolves a known user id to their display name", () => {
  expect(displayNameFor("11111111-1111-4111-8111-111111111111", NAMES)).toBe("jane");
});

// The whole point of the bug fix: whatever happens, the caller never gets
// a uuid back to render.
test("never returns the raw id when the name can't be resolved", () => {
  const unresolvable = "33333333-3333-4333-8333-333333333333";
  const result = displayNameFor(unresolvable, NAMES);
  expect(result).toBe(UNKNOWN_DISPLAY_NAME);
  expect(result).not.toContain(unresolvable);
});

test("handles a missing id without throwing", () => {
  expect(displayNameFor(null, NAMES)).toBe(UNKNOWN_DISPLAY_NAME);
  expect(displayNameFor(undefined, NAMES)).toBe(UNKNOWN_DISPLAY_NAME);
  expect(displayNameFor("", NAMES)).toBe(UNKNOWN_DISPLAY_NAME);
});

test("an empty name map resolves everything to the fallback, not to undefined", () => {
  expect(displayNameFor("11111111-1111-4111-8111-111111111111", new Map())).toBe(UNKNOWN_DISPLAY_NAME);
});
