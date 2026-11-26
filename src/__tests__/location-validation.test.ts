import { expect, test } from "vitest";
import { PLACE_NAME_SEPARATOR_MESSAGE } from "@/lib/limit-errors";
import { validatePlaceName } from "@/lib/location-validation";

test("validatePlaceName rejects an empty or whitespace-only name", () => {
  expect(validatePlaceName("")).toBe("Enter a name for this place.");
  expect(validatePlaceName("   ")).toBe("Enter a name for this place.");
});

test("validatePlaceName accepts a real name", () => {
  expect(validatePlaceName("Red box")).toBeUndefined();
});

test("validatePlaceName refuses the path separator, which would split the name in Activity", () => {
  expect(validatePlaceName("Garage › Shelf")).toBe(PLACE_NAME_SEPARATOR_MESSAGE);
  expect(validatePlaceName("Garage > Shelf")).toBeUndefined();
});
