import { expect, test } from "vitest";
import { validateLocationName, validateParentSelection } from "@/lib/location-validation";

test("validateLocationName rejects an empty or whitespace-only name", () => {
  expect(validateLocationName("")).toBe("Enter a name for this location.");
  expect(validateLocationName("   ")).toBe("Enter a name for this location.");
});

test("validateLocationName accepts a real name", () => {
  expect(validateLocationName("Red box")).toBeUndefined();
});

test("validateParentSelection accepts null (no parent chosen) as valid, not an error", () => {
  expect(validateParentSelection(null)).toBeUndefined();
});

test("validateParentSelection accepts an existing-location selection", () => {
  expect(
    validateParentSelection({ type: "existing", option: { id: "garage", path: "Garage" } }),
  ).toBeUndefined();
});

test("validateParentSelection rejects a '+ New place' selection", () => {
  expect(validateParentSelection({ type: "new", name: "Attic" })).toBe(
    "Pick an existing location from the list — adding a new one isn't supported here yet.",
  );
});
