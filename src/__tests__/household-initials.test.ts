import { expect, test } from "vitest";
import { FALLBACK_INITIALS, householdInitials } from "@/lib/household-initials";

test("takes the first letter of the first two words, uppercased", () => {
  expect(householdInitials("Shared home")).toBe("SH");
  expect(householdInitials("the old house by the lake")).toBe("TO");
});

test("a one-word name gives one letter", () => {
  expect(householdInitials("jane")).toBe("J");
});

test("skips leading punctuation and extra whitespace", () => {
  expect(householdInitials("  “Noa & Dan”  ")).toBe("ND");
  expect(householdInitials("-- 12 Elm Street")).toBe("1E");
});

test("falls back to H for a missing or blank name", () => {
  expect(householdInitials(null)).toBe(FALLBACK_INITIALS);
  expect(householdInitials(undefined)).toBe(FALLBACK_INITIALS);
  expect(householdInitials("   ")).toBe(FALLBACK_INITIALS);
  expect(householdInitials("—")).toBe(FALLBACK_INITIALS);
});
