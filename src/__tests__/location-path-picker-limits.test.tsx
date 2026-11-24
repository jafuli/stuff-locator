import { useState } from "react";
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPathPicker } from "@/components/location-path-picker";
import type { Location } from "@/lib/fixtures/types";
import { DEPTH_LIMIT_PICKER_NOTE, PLACE_LIMIT_PICKER_NOTE } from "@/lib/limit-errors";
import {
  addPlaceLimit,
  buildRows,
  chipsForPlace,
  createLimit,
  moveDestinationsPastDepthLimit,
  subtreeHeight,
  type PathChip,
} from "@/lib/location-path-picker";

/** A chain of `depth` nested places: Level 1 › Level 2 › … */
function chain(depth: number, prefix = "level"): Location[] {
  return Array.from({ length: depth }, (_, index) => ({
    id: `${prefix}-${String(index + 1)}`,
    parentId: index === 0 ? null : `${prefix}-${String(index)}`,
    name: `${prefix === "level" ? "Level" : prefix} ${String(index + 1)}`,
  }));
}

/** `count` top-level places. */
function flat(count: number): Location[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `place-${String(index + 1)}`,
    parentId: null,
    name: `Place ${String(index + 1)}`,
  }));
}

describe("createLimit / addPlaceLimit", () => {
  test("a path of 8 can't grow; 7 can", () => {
    const eight = chipsForPlace("level-8", chain(8));
    const seven = chipsForPlace("level-7", chain(8));
    expect(createLimit(8, eight)).toBe("depthLimit");
    expect(createLimit(8, seven)).toBeNull();
  });

  test("the place cap counts the new chips already queued", () => {
    const queued: PathChip[] = [
      { kind: "new", name: "Loft" },
      { kind: "new", name: "Box" },
    ];
    expect(createLimit(97, queued)).toBeNull();
    expect(createLimit(98, queued)).toBe("placeLimit");
  });

  test("'+ Add a place here' checks the place it is inside, depth first", () => {
    expect(addPlaceLimit(10, 0)).toBeNull();
    expect(addPlaceLimit(100, 0)).toBe("placeLimit");
    expect(addPlaceLimit(10, 8)).toBe("depthLimit");
    expect(addPlaceLimit(100, 8)).toBe("depthLimit");
  });
});

describe("buildRows at a limit", () => {
  test("at the place cap, '+ New' becomes a note and existing places stay", () => {
    const rows = buildRows({ locations: flat(100), chips: [], query: "Place" });
    expect(rows.createName).toBeNull();
    expect(rows.createBlocked).toBe("placeLimit");
    expect(rows.inside.length).toBeGreaterThan(0);
  });

  test("no note when nothing would be created anyway (empty query, exact sibling, pick-only)", () => {
    const locations = flat(100);
    expect(buildRows({ locations, chips: [], query: "" }).createBlocked).toBeNull();
    expect(buildRows({ locations, chips: [], query: "place 1" }).createBlocked).toBeNull();
    expect(buildRows({ locations, chips: [], query: "Shed", pickOnly: true }).createBlocked).toBeNull();
  });
});

describe("Move into… and the depth limit", () => {
  test("subtreeHeight counts the place and its deepest branch", () => {
    const locations = [...chain(3, "box"), { id: "side", parentId: "box-1", name: "Side" }];
    expect(subtreeHeight("box-1", locations)).toBe(3);
    expect(subtreeHeight("box-3", locations)).toBe(1);
  });

  test("a destination is past the limit when its depth plus the moved subtree's height passes 8", () => {
    const locations = [...chain(6), ...chain(3, "box")];
    const blocked = moveDestinationsPastDepthLimit("box-1", locations);
    // Level 5 (depth 5) + 3 = 8 is fine; Level 6 (depth 6) + 3 = 9 is not.
    expect(blocked).toContain("level-6");
    expect(blocked).not.toContain("level-5");
  });
});

function Harness({
  locations,
  initial = [],
  pickOnly,
  disabledIds,
}: {
  locations: readonly Location[];
  initial?: PathChip[];
  pickOnly?: boolean;
  disabledIds?: readonly string[];
}) {
  const [chips, setChips] = useState<PathChip[]>(initial);
  return (
    <LocationPathPicker
      locations={locations}
      value={chips}
      onChange={setChips}
      pickOnly={pickOnly}
      disabledIds={disabledIds}
    />
  );
}

describe("LocationPathPicker at a limit", () => {
  test("at the place cap, typing a new name shows the note instead of a '+ New' option", async () => {
    const user = userEvent.setup();
    render(<Harness locations={flat(100)} />);

    await user.type(screen.getByRole("combobox"), "Shed");

    expect(screen.queryByRole("option", { name: /New place/ })).toBeNull();
    expect(screen.getByText(PLACE_LIMIT_PICKER_NOTE)).toBeDefined();
    expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toContain("-limit");
  });

  test("inside a place that is already 8 in, the note says to put it here or pick higher up", async () => {
    const user = userEvent.setup();
    const locations = chain(8);
    render(<Harness locations={locations} initial={chipsForPlace("level-8", locations)} />);

    await user.type(screen.getByRole("combobox"), "Pouch");

    expect(screen.queryByRole("option", { name: /^New/ })).toBeNull();
    expect(screen.getByText(DEPTH_LIMIT_PICKER_NOTE)).toBeDefined();
  });

  test("Enter on a limited field adds nothing", async () => {
    const user = userEvent.setup();
    render(<Harness locations={flat(100)} />);

    await user.type(screen.getByRole("combobox"), "Shed{Enter}");

    expect(screen.getByRole("group", { name: /^Location:/ }).getAttribute("aria-label")).toBe("Location: none chosen");
  });

  test("a disabled destination is listed with 'Limit reached', aria-disabled, and can't be picked", async () => {
    const user = userEvent.setup();
    const locations = flat(3);
    render(<Harness locations={locations} pickOnly disabledIds={["place-2"]} />);

    await user.click(screen.getByRole("combobox"));
    const option = screen.getByRole("option", { name: "Place 2, limit reached" });
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain("Limit reached");

    await user.click(option);
    expect(screen.getByRole("group", { name: /^Location:/ }).getAttribute("aria-label")).toBe("Location: none chosen");
  });

  test("the place-name field stops at 60 characters and shows a counter from 54", async () => {
    const user = userEvent.setup();
    render(<Harness locations={flat(1)} />);
    const field = screen.getByRole<HTMLInputElement>("combobox");

    await user.type(field, "x".repeat(54));
    expect(screen.getByText("54 / 60")).toBeDefined();

    await user.type(field, "y".repeat(20));
    expect(field.value).toHaveLength(60);
  });
});
describe("the path separator", () => {
  test("typing '›' never offers '+ New': it is a path, found under 'Matches anywhere'", () => {
    const locations = chain(2);
    const rows = buildRows({ locations, chips: [], query: "Level 1 › Level 2" });
    expect(rows.createName).toBeNull();
    expect(rows.createBlocked).toBeNull();
    expect(rows.anywhere.map((row) => row.place.id)).toContain("level-2");
  });
});
