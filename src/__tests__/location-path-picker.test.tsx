import { useState, type SubmitEvent } from "react";
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
    await user.keyboard("{Enter}");

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
    const create = screen.getByRole("option", { name: "New “Top drawer” inside Office › Cabinet, new place" });
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
    await user.click(screen.getByRole("option", { name: "New place “Office”, top level" }));
    await user.type(screen.getByRole("combobox"), "Cabinet");
    await user.click(screen.getByRole("option", { name: "New “Cabinet” inside Office, new place" }));

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

  // WCAG 2.5.3 Label in Name: an option's accessible name must contain its
  // visible words, in order, so a voice-control user can say what they see.
  // axe 4.14 made its label-content-name-mismatch rule a default one; this
  // compares the same way (letters and digits only, case-insensitive), so a
  // regression shows up here, not only in the e2e axe run.
  describe("every option's accessible name contains its visible text", () => {
    const words = (text: string) =>
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    const expectLabelInName = () => {
      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(words(option.getAttribute("aria-label") ?? "")).toContain(words(option.textContent));
      }
    };

    test("existing matches and '+ New place …' at the top level", async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.type(screen.getByRole("combobox"), "cab");
      expect(screen.getByRole("option", { name: "New place “cab”, top level" })).toBeDefined();
      expectLabelInName();
    });

    test("'+ New …' inside a place", async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initial={[
            { kind: "existing", id: "office", name: "Office" },
            { kind: "existing", id: "cabinet", name: "Cabinet" },
          ]}
        />,
      );
      await user.type(screen.getByRole("combobox"), "Top drawer");
      expect(screen.getByRole("option", { name: "New “Top drawer” inside Office › Cabinet, new place" })).toBeDefined();
      expectLabelInName();
    });

    test("an existing sibling listed as 'already here'", async () => {
      const user = userEvent.setup();
      render(<Harness initial={[{ kind: "existing", id: "garage", name: "Garage" }]} />);
      await user.type(screen.getByRole("combobox"), "closet");
      expect(screen.getByRole("option", { name: "Garage › Closet, already here" })).toBeDefined();
      expectLabelInName();
    });
  });
});

describe("Enter chooses the first option", () => {
  const highlighted = () =>
    screen.getAllByRole("option").filter((option) => option.getAttribute("aria-selected") === "true");

  test("the first option is highlighted as soon as the list opens, and Enter picks the existing place", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "cab");

    // Two existing matches, then "+ New place “cab”".
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label"))).toEqual([
      "Kitchen › Spice cabinet",
      "Office › Cabinet",
      "New place “cab”, top level",
    ]);
    expect(highlighted().map((option) => option.getAttribute("aria-label"))).toEqual(["Kitchen › Spice cabinet"]);
    expect(screen.getByRole("combobox").getAttribute("aria-activedescendant")).toBe(highlighted()[0]?.id);

    await user.keyboard("{Enter}");
    expect(group().getAttribute("aria-label")).toBe("Location: Kitchen › Spice cabinet");
  });

  test("when '+ New place …' is the only option, type-then-Enter adds it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "Attic");
    await user.keyboard("{Enter}");

    expect(group().getAttribute("aria-label")).toBe("Location: Attic");
    expect(within(group()).getByRole("button", { name: "Attic, new place. Go back to this level" })).toBeDefined();
  });

  test("the highlight follows the typing: it is back on the first option after every keystroke", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "ca");
    await user.keyboard("{ArrowDown}");
    await user.type(screen.getByRole("combobox"), "b");

    expect(highlighted().map((option) => option.getAttribute("aria-label"))).toEqual(["Kitchen › Spice cabinet"]);
  });

  test("arrow keys still move the highlight, and Enter picks what is highlighted", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), "cab");
    await user.keyboard("{ArrowDown}");
    expect(highlighted().map((option) => option.getAttribute("aria-label"))).toEqual(["Office › Cabinet"]);
    await user.keyboard("{ArrowUp}");
    expect(highlighted().map((option) => option.getAttribute("aria-label"))).toEqual(["Kitchen › Spice cabinet"]);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(group().getAttribute("aria-label")).toBe("Location: Office › Cabinet");
  });

  test("Escape closes the list without choosing anything", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChangeSpy={onChange} />);

    await user.type(screen.getByRole("combobox"), "cab");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("option")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(group().getAttribute("aria-label")).toBe("Location: none chosen");
  });

  test("Enter with an empty field and no options does nothing and never submits the surrounding form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Harness locations={[]} onChangeSpy={onChange} />
        <button type="submit">Save</button>
      </form>,
    );

    await user.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("option")).toBeNull();
    await user.keyboard("{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("Enter that picks an option doesn't submit the surrounding form either", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Harness />
        <button type="submit">Save</button>
      </form>,
    );

    await user.type(screen.getByRole("combobox"), "Attic");
    await user.keyboard("{Enter}");

    expect(group().getAttribute("aria-label")).toBe("Location: Attic");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
