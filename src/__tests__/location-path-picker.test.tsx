import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPathPicker } from "@/components/location-path-picker";
import type { Location } from "@/lib/fixtures/types";
import type { PathChip } from "@/lib/location-path-picker";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "closet", parentId: "garage", name: "Closet" },
  { id: "toolbox", parentId: "closet", name: "Toolbox" },
  { id: "red-box", parentId: "toolbox", name: "Red box" },
  { id: "office", parentId: null, name: "Office" },
  { id: "cabinet", parentId: "office", name: "Cabinet" },
  { id: "kitchen", parentId: null, name: "Kitchen" },
  { id: "spice-cabinet", parentId: "kitchen", name: "Spice cabinet" },
];

interface HarnessProps {
  locations?: readonly Location[];
  initial?: PathChip[];
  pickOnly?: boolean;
  excludeIds?: readonly string[];
  onChangeSpy?: (chips: PathChip[]) => void;
}

function Harness({ locations = LOCATIONS, initial = [], pickOnly, excludeIds, onChangeSpy }: HarnessProps) {
  const [chips, setChips] = useState<PathChip[]>(initial);
  return (
    <LocationPathPicker
      locations={locations}
      value={chips}
      onChange={(next) => {
        setChips(next);
        onChangeSpy?.(next);
      }}
      pickOnly={pickOnly}
      excludeIds={excludeIds}
    />
  );
}

const group = () => screen.getByRole("group", { name: /^Location:/ });

describe("finding places", () => {
  test("typing reaches a deep place by full path; picking it expands to solid chips for every level", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "red");
    await user.click(screen.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" }));

    expect(group().getAttribute("aria-label")).toBe("Location: Garage › Closet › Toolbox › Red box");
    expect(screen.getByText("Goes in")).toBeDefined();
    expect(within(group()).getAllByRole("button")).toHaveLength(4);
  });

  test("after picking a place the field is empty and focused, and typing searches inside it first", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "offi");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("");
    await user.type(screen.getByRole("combobox"), "cab");

    const inside = screen.getByRole("group", { name: "Inside Office" });
    expect(within(inside).getByRole("option", { name: "Office › Cabinet" })).toBeDefined();
    // And the Kitchen's cabinet is listed separately, under "anywhere".
    const anywhere = screen.getByRole("group", { name: "Matches anywhere" });
    expect(within(anywhere).getByRole("option", { name: "Kitchen › Spice cabinet" })).toBeDefined();
  });

  test("picking from 'Matches anywhere' replaces all chips with that path", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ kind: "existing", id: "office", name: "Office" }]} />);

    await user.type(screen.getByRole("combobox"), "spice");
    await user.click(screen.getByRole("option", { name: "Kitchen › Spice cabinet" }));

    expect(group().getAttribute("aria-label")).toBe("Location: Kitchen › Spice cabinet");
  });
});

describe("creating places", () => {
  test("a name that doesn't exist offers '+ New … inside <path>'; picking it adds a dashed chip, nothing is written", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness
        onChangeSpy={onChange}
        initial={[
          { kind: "existing", id: "office", name: "Office" },
          { kind: "existing", id: "cabinet", name: "Cabinet" },
        ]}
      />,
    );

    await user.type(screen.getByRole("combobox"), "Top drawer");
    const create = screen.getByRole("option", { name: "New place 'Top drawer' inside Office › Cabinet" });
    await user.click(create);

    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "existing", id: "office", name: "Office" },
      { kind: "existing", id: "cabinet", name: "Cabinet" },
      { kind: "new", name: "Top drawer" },
    ]);
    expect(screen.getByText(/1 new place$/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Top drawer, new place. Go back to this level" })).toBeDefined();
  });

  test("new levels can be chained, and each is a dashed chip", async () => {
    const user = userEvent.setup();
    render(<Harness locations={[]} />);

    await user.type(screen.getByRole("combobox"), "Office");
    await user.click(screen.getByRole("option", { name: "New place 'Office' at the top level" }));
    await user.type(screen.getByRole("combobox"), "Cabinet");
    await user.click(screen.getByRole("option", { name: "New place 'Cabinet' inside Office" }));

    expect(group().getAttribute("aria-label")).toBe("Location: Office › Cabinet");
    expect(screen.getByText(/2 new places$/)).toBeDefined();
  });

  test("an exact existing sibling, in any case, is listed 'already here' and there is no + New row", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ kind: "existing", id: "office", name: "Office" }]} />);

    await user.type(screen.getByRole("combobox"), "CABINET");

    expect(screen.getByRole("option", { name: "Office › Cabinet, already here" })).toBeDefined();
    expect(screen.queryByRole("option", { name: /^New place/ })).toBeNull();
  });

  test("typing an existing top-level name again resolves to it instead of offering a duplicate", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "office");

    expect(screen.getByRole("option", { name: "Office, already here" })).toBeDefined();
    expect(screen.queryByRole("option", { name: /^New place/ })).toBeNull();
  });
});

describe("editing the path", () => {
  test("Backspace in the empty field pops the last chip and announces it", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { kind: "existing", id: "office", name: "Office" },
          { kind: "existing", id: "cabinet", name: "Cabinet" },
        ]}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Backspace}");

    expect(group().getAttribute("aria-label")).toBe("Location: Office");
    expect(document.querySelector("[aria-live='polite']")?.textContent).toContain("Removed Cabinet");
  });

  test("Backspace with text in the field edits the text, not the chips", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ kind: "existing", id: "office", name: "Office" }]} />);

    await user.type(screen.getByRole("combobox"), "ab");
    await user.keyboard("{Backspace}");

    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("a");
    expect(group().getAttribute("aria-label")).toBe("Location: Office");
  });

  test("tapping a chip goes back to that level and returns focus to the field", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { kind: "existing", id: "garage", name: "Garage" },
          { kind: "existing", id: "closet", name: "Closet" },
          { kind: "existing", id: "toolbox", name: "Toolbox" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Closet. Go back to this level" }));

    expect(group().getAttribute("aria-label")).toBe("Location: Garage › Closet");
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  test("the group is announced as 'none chosen' before anything is picked", () => {
    render(<Harness />);
    expect(group().getAttribute("aria-label")).toBe("Location: none chosen");
  });
});

describe("pick-only mode", () => {
  test("never offers a + New row and never creates a chip from typed text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness pickOnly onChangeSpy={onChange} />);

    await user.type(screen.getByRole("combobox"), "attic");

    expect(screen.queryByRole("option")).toBeNull();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("excludeIds hides a place and everything inside it", async () => {
    const user = userEvent.setup();
    render(<Harness pickOnly excludeIds={["garage"]} />);

    await user.type(screen.getByRole("combobox"), "box");

    expect(screen.queryByRole("option", { name: /Red box/ })).toBeNull();
  });
});

describe("accessibility wiring", () => {
  test("the input is a labelled combobox, and a validation message is wired to it", () => {
    render(
      <>
        <LocationPathPicker locations={LOCATIONS} value={[]} onChange={vi.fn()} describedBy="err" />
        <p id="err">Choose a location for this item.</p>
      </>,
    );

    const input = screen.getByRole("combobox", { name: "Location" });
    expect(input.getAttribute("aria-describedby")).toBe("err");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("chips are real buttons with a 44px touch target", () => {
    render(<Harness initial={[{ kind: "existing", id: "office", name: "Office" }]} />);

    const chip = screen.getByRole("button", { name: "Office. Go back to this level" });
    expect(chip.tagName).toBe("BUTTON");
    expect(chip.className).toContain("min-h-target-min");
    expect(chip.className).toContain("min-w-target-min");
  });

  test("a new chip is dashed and untaped, and nothing before it is on tape either", () => {
    render(
      <Harness
        initial={[
          { kind: "existing", id: "office", name: "Office" },
          { kind: "existing", id: "cabinet", name: "Cabinet" },
          { kind: "new", name: "Top drawer" },
        ]}
      />,
    );
    const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
    // Top drawer isn't saved yet, so the tape waits for it (it prints in on save).
    expect(chip("Cabinet").className).not.toContain("bg-tape");
    expect(chip("Top drawer").className).toContain("border-dashed");
    expect(chip("Top drawer").className).not.toContain("bg-tape");
    expect(chip("Office").className).not.toContain("bg-tape");
  });

  test("with only existing chips, only the last one is on tape", () => {
    render(
      <Harness
        initial={[
          { kind: "existing", id: "office", name: "Office" },
          { kind: "existing", id: "cabinet", name: "Cabinet" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /^Cabinet/ }).className).toContain("bg-tape");
    expect(screen.getByRole("button", { name: /^Office/ }).className).not.toContain("bg-tape");
  });
});
