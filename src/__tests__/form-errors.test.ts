import { expect, test } from "vitest";
import { firstInvalidField } from "@/lib/form-errors";

const ORDER = ["name", "location"] as const;

test("the first field in on-screen order that has an error", () => {
  expect(firstInvalidField({ name: "Enter a name.", location: "Choose a place." }, ORDER)).toBe("name");
  expect(firstInvalidField({ location: "Choose a place." }, ORDER)).toBe("location");
  // Order decides, not the object's key order.
  expect(firstInvalidField({ location: "Choose a place.", name: "Enter a name." }, ORDER)).toBe("name");
});

test("null when every field is valid, including fields present but undefined", () => {
  expect(firstInvalidField({}, ORDER)).toBeNull();
  expect(firstInvalidField({ name: undefined, location: undefined }, ORDER)).toBeNull();
});
