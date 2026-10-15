import { expect, test } from "vitest";
import { validateLocationName } from "@/lib/location-validation";

test("validateLocationName rejects an empty or whitespace-only name", () => {
  expect(validateLocationName("")).toBe("Enter a name for this location.");
  expect(validateLocationName("   ")).toBe("Enter a name for this location.");
});

test("validateLocationName accepts a real name", () => {
  expect(validateLocationName("Red box")).toBeUndefined();
});
