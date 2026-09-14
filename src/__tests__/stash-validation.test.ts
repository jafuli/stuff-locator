import { expect, test } from "vitest";
import { validateItemName, validateLocationSelection } from "@/lib/stash-validation";
import type { AutocompleteSelection } from "@/components/location-autocomplete";

test("validateItemName rejects an empty value", () => {
  expect(validateItemName("")).toBe("Enter a name for this item.");
  expect(validateItemName("   ")).toBe("Enter a name for this item.");
});

test("validateItemName accepts a non-empty value", () => {
  expect(validateItemName("Passport")).toBeUndefined();
});

test("validateLocationSelection rejects no selection at all", () => {
  expect(validateLocationSelection(null)).toBe("Choose a location for this item.");
});

test("validateLocationSelection rejects a typed-but-unresolved 'new' selection", () => {
  const selection: AutocompleteSelection = { type: "new", name: "Attic" };
  expect(validateLocationSelection(selection)).toBe(
    "Pick an existing location from the list — adding a new one isn't supported here yet.",
  );
});

test("validateLocationSelection accepts an existing location", () => {
  const selection: AutocompleteSelection = {
    type: "existing",
    option: { id: "garage", path: "Garage" },
  };
  expect(validateLocationSelection(selection)).toBeUndefined();
});
