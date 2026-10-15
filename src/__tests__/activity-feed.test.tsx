import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityFeed } from "@/components/activity-feed";
import type { ActivityEntry } from "@/lib/activity";

const NOW = new Date("2026-10-15T12:00:00Z");

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "e1",
    kind: "item_added",
    actor: "Maayan",
    subjectId: "i1",
    subjectName: "Camping tent",
    fromText: null,
    toText: null,
    detailText: null,
    at: new Date("2026-10-15T10:00:00Z"),
    ...overrides,
  };
}

function renderOne(overrides: Partial<ActivityEntry>) {
  render(<ActivityFeed entries={[entry(overrides)]} now={NOW} />);
  return screen.getByRole("listitem");
}

test("renders the empty state when there are no entries", () => {
  render(<ActivityFeed entries={[]} now={NOW} />);
  expect(screen.getByText("Nothing has happened yet")).toBeDefined();
});

describe("each kind", () => {
  test("item_added: actor, 'added', a link to the item, and 'in <path>'", () => {
    const row = renderOne({ kind: "item_added", toText: "Garage › Shelf" });

    expect(row.textContent).toContain("Maayan");
    expect(row.textContent).toContain("added");
    expect(within(row).getByRole("link", { name: "Camping tent" }).getAttribute("href")).toBe("/items/i1");
    expect(row.textContent).toContain("in Garage › Shelf");
  });

  test("item_moved: the item link and 'from → to'", () => {
    const row = renderOne({
      kind: "item_moved",
      subjectName: "Spare house keys",
      fromText: "Hallway › Hook",
      toText: "Kitchen › Key bowl",
    });

    expect(row.textContent).toContain("moved");
    expect(within(row).getByRole("link", { name: "Spare house keys" })).toBeDefined();
    expect(row.textContent).toContain("Hallway › Hook → Kitchen › Key bowl");
  });

  test("item_moved without from_text (a backfilled move) reads 'to <path>'", () => {
    const row = renderOne({ kind: "item_moved", fromText: null, toText: "Kitchen › Key bowl" });

    expect(row.textContent).toContain("to Kitchen › Key bowl");
    expect(row.textContent).not.toContain("→");
  });

  test("item_renamed: 'renamed <old> → <new>', the new name linking to the item", () => {
    const row = renderOne({
      kind: "item_renamed",
      subjectName: "Passport (blue)",
      fromText: "passport",
      toText: "Passport (blue)",
    });

    expect(row.textContent).toContain("renamed passport → Passport (blue)");
    expect(within(row).getByRole("link", { name: "Passport (blue)" }).getAttribute("href")).toBe("/items/i1");
  });

  test("item_detail_changed: shows the new detail", () => {
    const row = renderOne({ kind: "item_detail_changed", detailText: "poles are in the blue bag" });

    expect(row.textContent).toContain("edited the detail of");
    expect(row.textContent).toContain("“poles are in the blue bag”");
  });

  test("item_detail_changed with the detail cleared says it was removed", () => {
    const row = renderOne({ kind: "item_detail_changed", fromText: "old", detailText: null });

    expect(row.textContent).toContain("removed the detail");
  });

  test("item_deleted: the name is plain text (no page to link to) and 'was in <path>'", () => {
    const row = renderOne({
      kind: "item_deleted",
      subjectName: "old phone charger",
      fromText: "Office › Cabinet › Top drawer",
    });

    expect(row.textContent).toContain("deleted old phone charger");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(row.textContent).toContain("was in Office › Cabinet › Top drawer");
  });

  test("place_renamed: 'renamed a place' and '<parent> › <old> → <new>'", () => {
    const row = renderOne({
      kind: "place_renamed",
      subjectName: "Filing cabinet",
      fromText: "Office › Cabinet",
      toText: "Filing cabinet",
    });

    expect(row.textContent).toContain("renamed a place");
    expect(row.textContent).toContain("Office › Cabinet → Filing cabinet");
  });

  test("place_moved: 'moved the place <name>' and 'from → to', with the top level named", () => {
    const row = renderOne({
      kind: "place_moved",
      subjectName: "Camping box",
      fromText: null,
      toText: "Bedroom › Under bed",
    });

    expect(row.textContent).toContain("moved the place Camping box");
    expect(row.textContent).toContain("Top level → Bedroom › Under bed");
  });

  test("place_deleted: 'deleted the place <name>' and 'was in <parent path>'", () => {
    const row = renderOne({ kind: "place_deleted", subjectName: "Bottom drawer", fromText: "Office › Cabinet" });

    expect(row.textContent).toContain("deleted the place Bottom drawer");
    expect(row.textContent).toContain("was in Office › Cabinet");
  });

  test("a place deleted from the top level says so rather than 'was in null'", () => {
    const row = renderOne({ kind: "place_deleted", subjectName: "Shed", fromText: null });

    expect(row.textContent).toContain("was in the top level");
  });
});

describe("grouping and order", () => {
  test("splits into This week and Earlier, keeping the given newest-first order inside each", () => {
    render(
      <ActivityFeed
        now={NOW}
        entries={[
          entry({ id: "a", subjectName: "Newest", at: new Date("2026-10-15T11:00:00Z") }),
          entry({ id: "b", subjectName: "Three days", at: new Date("2026-10-12T11:00:00Z") }),
          entry({ id: "c", subjectName: "Last month", at: new Date("2026-09-10T11:00:00Z") }),
        ]}
      />,
    );

    const thisWeek = screen.getByRole("region", { name: "This week" });
    const earlier = screen.getByRole("region", { name: "Earlier" });
    expect(
      within(thisWeek)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining("Newest"), expect.stringContaining("Three days")]);
    expect(within(earlier).getAllByRole("listitem")).toHaveLength(1);
  });

  test("a group with nothing in it is not rendered at all", () => {
    render(<ActivityFeed now={NOW} entries={[entry({ at: new Date("2026-10-15T11:00:00Z") })]} />);

    expect(screen.getByRole("region", { name: "This week" })).toBeDefined();
    expect(screen.queryByRole("region", { name: "Earlier" })).toBeNull();
  });

  test("every entry has a relative time, and the actor's name is shown, not an id", () => {
    const row = renderOne({ actor: "Someone", at: new Date("2026-10-15T09:00:00Z") });

    expect(row.querySelector("time")?.textContent).toBe("3 hours ago");
    expect(row.textContent).toContain("Someone");
  });
});
