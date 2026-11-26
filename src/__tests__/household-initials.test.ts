import { expect, test } from "vitest";
import { FALLBACK_INITIALS, householdInitials } from "@/lib/household-initials";

test("one letter, from the owner's first name, uppercased", () => {
  expect(householdInitials("Noa Levi")).toBe("N");
  expect(householdInitials("jane.doe")).toBe("J");
});

test("skips leading punctuation, symbols and whitespace", () => {
  expect(householdInitials("  “noa”  ")).toBe("N");
  expect(householdInitials("-- 12 Elm")).toBe("1");
  expect(householdInitials("🙂 Maya")).toBe("M");
});

test("a 50-character one-word name still gives one letter", () => {
  expect(householdInitials("w".repeat(50))).toBe("W");
});

test("falls back to H for a missing or letterless name", () => {
  expect(householdInitials(null)).toBe(FALLBACK_INITIALS);
  expect(householdInitials(undefined)).toBe(FALLBACK_INITIALS);
  expect(householdInitials("   ")).toBe(FALLBACK_INITIALS);
  expect(householdInitials("—")).toBe(FALLBACK_INITIALS);
});
