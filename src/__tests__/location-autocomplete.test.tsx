import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LocationAutocomplete,
  filterLocationOptions,
  splitMatchSegments,
} from "@/components/location-autocomplete";
import type { LocationOption } from "@/lib/fixtures/location-path";

const OPTIONS: LocationOption[] = [
  { id: "red-box", path: "Garage › Closet › Toolbox › Red box" },
  { id: "red-folder-tray", path: "Office › Red folder tray" },
  { id: "filing-box", path: "Bedroom › Filing box" },
];

describe("filterLocationOptions", () => {
  test("matches case-insensitively across the full path", () => {
    expect(filterLocationOptions(OPTIONS, "RED")).toEqual([OPTIONS[0], OPTIONS[1]]);
  });

  test("returns everything for an empty query", () => {
    expect(filterLocationOptions(OPTIONS, "  ")).toEqual(OPTIONS);
  });

  test("returns nothing for a query with no matches", () => {
    expect(filterLocationOptions(OPTIONS, "attic")).toEqual([]);
  });
});

describe("splitMatchSegments", () => {
  test("splits around the first case-insensitive match", () => {
    expect(splitMatchSegments("Garage › Closet › Toolbox › Red box", "red")).toEqual([
      { text: "Garage › Closet › Toolbox › ", matched: false },
      { text: "Red", matched: true },
      { text: " box", matched: false },
    ]);
  });

  test("returns one unmatched segment when there is no match", () => {
    expect(splitMatchSegments("Bedroom › Filing box", "attic")).toEqual([
      { text: "Bedroom › Filing box", matched: false },
    ]);
  });
});

test("shows the full option list when the query is empty", async () => {
  const user = userEvent.setup();
  render(<LocationAutocomplete options={OPTIONS} onSelect={vi.fn()} />);
  await user.click(screen.getByRole("combobox"));
  expect(screen.getAllByRole("option")).toHaveLength(3);
});

test("filters matches and always appends the create-new row last, once typing starts", async () => {
  const user = userEvent.setup();
  render(<LocationAutocomplete options={OPTIONS} onSelect={vi.fn()} />);
  await user.type(screen.getByRole("combobox"), "red");
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(3);
  expect(options.at(-1)?.textContent).toBe('+ New place called "red"…');
});

test("offers only the create-new row when nothing matches", async () => {
  const user = userEvent.setup();
  render(<LocationAutocomplete options={OPTIONS} onSelect={vi.fn()} />);
  await user.type(screen.getByRole("combobox"), "attic");
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(1);
  expect(options[0].textContent).toBe('+ New place called "attic"…');
});

test("does not offer a create-new row for an empty query", async () => {
  const user = userEvent.setup();
  render(<LocationAutocomplete options={OPTIONS} onSelect={vi.fn()} />);
  await user.click(screen.getByRole("combobox"));
  const options = screen.getAllByRole("option");
  expect(options.every((option) => !option.textContent.startsWith("+ New place"))).toBe(true);
});

test("selecting an existing option via the keyboard calls onSelect with it", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<LocationAutocomplete options={OPTIONS} onSelect={onSelect} />);
  await user.type(screen.getByRole("combobox"), "red");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onSelect).toHaveBeenCalledWith({ type: "existing", option: OPTIONS[0] });
});

test("selecting the create-new row via the keyboard calls onSelect with the typed name", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<LocationAutocomplete options={OPTIONS} onSelect={onSelect} />);
  await user.type(screen.getByRole("combobox"), "attic");
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onSelect).toHaveBeenCalledWith({ type: "new", name: "attic" });
});

test("shows a loading hint and no selectable options while isLoading", () => {
  render(<LocationAutocomplete options={OPTIONS} onSelect={vi.fn()} isLoading />);
  expect(screen.getByText("Loading places…")).toBeDefined();
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

test("shows the error message via a live region", () => {
  render(<LocationAutocomplete options={OPTIONS} onSelect={vi.fn()} error="Couldn't load your places." />);
  expect(screen.getByRole("alert").textContent).toBe("Couldn't load your places.");
});
