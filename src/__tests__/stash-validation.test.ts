import { expect, test } from "vitest";
import { validateItemName, validateLocationPath } from "@/lib/stash-validation";

test("validateItemName rejects an empty value", () => {
  expect(validateItemName("")).toBe("Enter a name for this item.");
  expect(validateItemName("   ")).toBe("Enter a name for this item.");
});

test("validateItemName accepts a non-empty value", () => {
  expect(validateItemName("Passport")).toBeUndefined();
});

test("validateLocationPath rejects no chips at all", () => {
  expect(validateLocationPath([], "")).toBe("Choose a location for this item.");
});

test("validateLocationPath rejects typed-but-unresolved text, even when chips exist", () => {
  expect(validateLocationPath([{ kind: "existing", id: "garage", name: "Garage" }], "Clo")).toBe(
    "Choose a location for this item.",
  );
});

test("validateLocationPath accepts an existing path, a new path, and whitespace-only leftovers", () => {
  expect(validateLocationPath([{ kind: "existing", id: "garage", name: "Garage" }], "  ")).toBeUndefined();
  expect(validateLocationPath([{ kind: "new", name: "Attic" }], "")).toBeUndefined();
});
