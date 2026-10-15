import { expect, test } from "vitest";
import { validatePlaceName } from "@/lib/location-validation";

test("validatePlaceName rejects an empty or whitespace-only name", () => {
  expect(validatePlaceName("")).toBe("Enter a name for this place.");
  expect(validatePlaceName("   ")).toBe("Enter a name for this place.");
});

test("validatePlaceName accepts a real name", () => {
  expect(validatePlaceName("Red box")).toBeUndefined();
});
