import { describe, expect, test } from "vitest";
import type { Location } from "@/lib/fixtures/types";
import {
  addNewLevel,
  buildRows,
  chipsForPlace,
  descend,
  lastExistingId,
  newChipCount,
  normalizePlaceName,
  popChip,
  resolvePath,
  truncateTo,
  type PathChip,
} from "@/lib/location-path-picker";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "closet", parentId: "garage", name: "Closet" },
  { id: "toolbox", parentId: "closet", name: "Toolbox" },
  { id: "red-box", parentId: "toolbox", name: "Red box" },
  { id: "office", parentId: null, name: "Office" },
  { id: "cabinet", parentId: "office", name: "Cabinet" },
  { id: "top-drawer", parentId: "cabinet", name: "Top drawer" },
  { id: "red-tray", parentId: "office", name: "Red folder tray" },
  { id: "kitchen", parentId: null, name: "Kitchen" },
  { id: "spice-cabinet", parentId: "kitchen", name: "Spice cabinet" },
];

const office: PathChip = { kind: "existing", id: "office", name: "Office" };
const cabinet: PathChip = { kind: "existing", id: "cabinet", name: "Cabinet" };

const names = (rows: { place: Location }[]) => rows.map((row) => row.place.name);

describe("normalizePlaceName", () => {
  test("trims and collapses whitespace, as the database does", () => {
    expect(normalizePlaceName("  Top   drawer \t")).toBe("Top drawer");
  });
});

describe("chipsForPlace", () => {
  test("expands a place to solid chips for every ancestor, root first", () => {
    expect(chipsForPlace("red-box", LOCATIONS)).toEqual([
      { kind: "existing", id: "garage", name: "Garage" },
      { kind: "existing", id: "closet", name: "Closet" },
      { kind: "existing", id: "toolbox", name: "Toolbox" },
      { kind: "existing", id: "red-box", name: "Red box" },
    ]);
  });

  test("an unknown id yields no chips", () => {
    expect(chipsForPlace("nope", LOCATIONS)).toEqual([]);
  });

  test("a parent cycle terminates", () => {
    const cyclic: Location[] = [
      { id: "a", parentId: "b", name: "A" },
      { id: "b", parentId: "a", name: "B" },
    ];
    expect(chipsForPlace("a", cyclic)).toHaveLength(2);
  });
});

describe("buildRows — what the dropdown offers", () => {
  test("at the top level with an empty field it lists the top-level places only", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [], query: "" });
    expect(names(rows.inside)).toEqual(["Garage", "Kitchen", "Office"]);
    expect(rows.anywhere).toEqual([]);
    expect(rows.createName).toBeNull();
  });

  test("a query matches full paths anywhere (typing 'red' reaches the red box)", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [], query: "red" });
    expect(rows.inside).toEqual([]);
    expect(rows.anywhere.map((row) => row.path)).toEqual([
      "Garage › Closet › Toolbox › Red box",
      "Office › Red folder tray",
    ]);
    expect(rows.createName).toBe("red");
    expect(rows.createInside).toBeNull();
  });

  test("with a chip, its own sub-places come first and 'anywhere' excludes them", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [office], query: "cab" });

    expect(names(rows.inside)).toEqual(["Cabinet"]);
    // Everything else matching "cab" anywhere, including deeper places inside
    // Cabinet itself (not direct children, so not in "inside").
    expect(rows.anywhere.map((row) => row.path)).toEqual(["Kitchen › Spice cabinet", "Office › Cabinet › Top drawer"]);
    // "Cabinet" is not an exact match for "cab", so creating is still offered.
    expect(rows.createName).toBe("cab");
    expect(rows.createInside).toBe("Office");
  });

  test("an exact sibling, in any case, is tagged 'already here' and replaces the + New row", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [office], query: "  CABINET " });

    expect(rows.inside).toHaveLength(1);
    expect(rows.inside[0]?.isExactSibling).toBe(true);
    expect(rows.createName).toBeNull();
  });

  test("the same name under a different parent is not a duplicate", () => {
    // "Top drawer" exists under Cabinet, not under Kitchen.
    const rows = buildRows({
      locations: LOCATIONS,
      chips: [{ kind: "existing", id: "kitchen", name: "Kitchen" }],
      query: "Top drawer",
    });

    expect(rows.createName).toBe("Top drawer");
    expect(rows.inside).toEqual([]);
    // It is still findable anywhere, so it can be picked instead.
    expect(rows.anywhere.map((row) => row.path)).toEqual(["Office › Cabinet › Top drawer"]);
  });

  test("an exact top-level match is flagged at the top level too", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [], query: "office" });

    expect(rows.inside[0]?.isExactSibling).toBe(true);
    expect(rows.createName).toBeNull();
    // Deeper matches still show under "anywhere".
    expect(rows.anywhere.map((row) => row.path)).toContain("Office › Cabinet › Top drawer");
  });

  test("after a new chip there is nothing 'inside' it, so only anywhere + New remain", () => {
    const rows = buildRows({
      locations: LOCATIONS,
      chips: [office, { kind: "new", name: "Shelf" }],
      query: "cab",
    });

    expect(rows.inside).toEqual([]);
    expect(rows.createName).toBe("cab");
    expect(rows.createInside).toBe("Office › Shelf");
  });

  test("pickOnly offers no + New row, even for a name that doesn't exist", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [], query: "attic", pickOnly: true });
    expect(rows.createName).toBeNull();
  });

  test("excludeIds removes a place and everything beneath it from every list", () => {
    const rows = buildRows({ locations: LOCATIONS, chips: [], query: "red", excludeIds: ["garage"] });

    expect(rows.anywhere.map((row) => row.path)).toEqual(["Office › Red folder tray"]);
    expect(names(buildRows({ locations: LOCATIONS, chips: [], query: "", excludeIds: ["office"] }).inside)).toEqual([
      "Garage",
      "Kitchen",
    ]);
  });
});

describe("chip state transitions", () => {
  test("descend adds a solid chip; addNewLevel adds a normalized dashed one", () => {
    const place = LOCATIONS.find((location) => location.id === "cabinet");
    if (!place) {
      throw new Error("fixture missing");
    }
    expect(descend([office], place)).toEqual([office, cabinet]);
    expect(addNewLevel([office], "  Top   drawer ")).toEqual([office, { kind: "new", name: "Top drawer" }]);
  });

  test("addNewLevel ignores a blank name", () => {
    expect(addNewLevel([office], "   ")).toEqual([office]);
  });

  test("popChip removes the last chip; truncateTo goes back to a level inclusive", () => {
    const chips: PathChip[] = [office, cabinet, { kind: "new", name: "Top drawer" }];
    expect(popChip(chips)).toEqual([office, cabinet]);
    expect(truncateTo(chips, 0)).toEqual([office]);
    expect(truncateTo(chips, 2)).toEqual(chips);
    expect(popChip([])).toEqual([]);
  });
});

describe("resolvePath — the arguments for stash_item / update_item", () => {
  test("no chips resolves to nothing", () => {
    expect(resolvePath([])).toBeNull();
  });

  test("all existing: the last place, no new path", () => {
    expect(resolvePath([office, cabinet])).toEqual({ locationId: "cabinet", newPath: [] });
  });

  test("mixed: the deepest existing place plus the new levels in order", () => {
    expect(resolvePath([office, cabinet, { kind: "new", name: "Top drawer" }, { kind: "new", name: "Left" }])).toEqual({
      locationId: "cabinet",
      newPath: ["Top drawer", "Left"],
    });
  });

  test("all new (a brand-new household): no location id, the whole path is new", () => {
    expect(
      resolvePath([
        { kind: "new", name: "Office" },
        { kind: "new", name: "Cabinet" },
      ]),
    ).toEqual({
      locationId: null,
      newPath: ["Office", "Cabinet"],
    });
  });

  test("lastExistingId and newChipCount agree with the chips", () => {
    const chips: PathChip[] = [office, { kind: "new", name: "Shelf" }];
    expect(lastExistingId(chips)).toBe("office");
    expect(newChipCount(chips)).toBe(1);
    expect(lastExistingId([{ kind: "new", name: "Shelf" }])).toBeNull();
  });
});
