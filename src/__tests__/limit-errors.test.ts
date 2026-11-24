import { describe, expect, test } from "vitest";
import {
  DEPTH_LIMIT_ADD_NOTE,
  DEPTH_LIMIT_PICKER_NOTE,
  HOUSEHOLD_FULL_MESSAGE,
  ITEM_LIMIT_MESSAGE,
  PLACE_LIMIT_ADD_NOTE,
  PLACE_LIMIT_PICKER_NOTE,
  PLACE_NAME_SEPARATOR_MESSAGE,
  TOO_LONG_MESSAGE,
  friendlyRpcError,
} from "@/lib/limit-errors";

const error = (code: string, message = "database message") => ({ code, message });

describe("friendlyRpcError", () => {
  test("SL001 (item cap) reads the same wherever an item is saved", () => {
    expect(friendlyRpcError(error("SL001"), "stash")).toBe(ITEM_LIMIT_MESSAGE);
    expect(ITEM_LIMIT_MESSAGE).toMatch(/^Limit reached: your household holds 100 things\./);
  });

  test("SL002 (place cap): the picker note for item saves, the add-place note for '+ Add a place here'", () => {
    expect(friendlyRpcError(error("SL002"), "stash")).toBe(PLACE_LIMIT_PICKER_NOTE);
    expect(friendlyRpcError(error("SL002"), "editItem")).toBe(PLACE_LIMIT_PICKER_NOTE);
    expect(friendlyRpcError(error("SL002"), "addPlace")).toBe(PLACE_LIMIT_ADD_NOTE);
  });

  test("SL003 (depth) says 'Limit reached' in every context, never 'too deep'", () => {
    const messages = [
      friendlyRpcError(error("SL003"), "stash"),
      friendlyRpcError(error("SL003"), "addPlace"),
      friendlyRpcError(error("SL003"), "movePlace", "Toolbox"),
    ];
    expect(messages[0]).toBe(DEPTH_LIMIT_PICKER_NOTE);
    expect(messages[1]).toBe(DEPTH_LIMIT_ADD_NOTE);
    expect(messages[2]).toContain("“Toolbox”");
    for (const message of messages) {
      expect(message).toMatch(/^Limit reached/);
      expect(message).not.toMatch(/deep|levels/i);
    }
  });

  test("SL005 (household full)", () => {
    expect(friendlyRpcError(error("SL005"), "stash")).toBe(HOUSEHOLD_FULL_MESSAGE);
  });

  test("23505 keeps each place form's own duplicate message", () => {
    expect(friendlyRpcError(error("23505"), "addPlace", "Shed")).toBe("You already have “Shed” here.");
    expect(friendlyRpcError(error("23505"), "renamePlace", "Shed")).toBe("You already have “Shed” here.");
    expect(friendlyRpcError(error("23505"), "movePlace", "Shed")).toBe(
      "There's already a place with this name there. Rename “Shed” first, then move it.",
    );
  });

  test("23514 (a length CHECK the form's maxLength should have prevented)", () => {
    expect(friendlyRpcError(error("23514"), "stash")).toBe(TOO_LONG_MESSAGE);
  });

  test("a move into its own subtree keeps its specific message", () => {
    expect(
      friendlyRpcError(
        error("P0001", "move_container: cannot move a location under its own descendant"),
        "movePlace",
        "Box",
      ),
    ).toBe("“Box” can't go inside itself or a place within it.");
  });

  test("anything unmapped falls back to the database's message", () => {
    expect(friendlyRpcError(error("P0001", "stash_item: location not found"), "stash")).toBe(
      "stash_item: location not found",
    );
    expect(friendlyRpcError({ message: "network down" }, "stash")).toBe("network down");
  });
});

describe("the path-separator CHECK", () => {
  test("23514 from locations_name_no_path_separator gets its own copy, not the length message", () => {
    const separator = error(
      "23514",
      'new row for relation "locations" violates check constraint "locations_name_no_path_separator"',
    );
    expect(friendlyRpcError(separator, "addPlace", "A › B")).toBe(PLACE_NAME_SEPARATOR_MESSAGE);
    expect(friendlyRpcError(error("23514", 'violates check constraint "locations_name_length"'), "addPlace")).toBe(
      TOO_LONG_MESSAGE,
    );
  });
});
