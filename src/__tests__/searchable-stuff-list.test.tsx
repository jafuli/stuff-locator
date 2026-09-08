import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableStuffList } from "@/components/searchable-stuff-list";
import type { StuffListEntry } from "@/components/stuff-list";
import type { Item } from "@/lib/fixtures/types";

const passport: Item = { id: "passport", locationId: "bedroom-filing-box", name: "Passport", detail: "with the birth certificates" };
const tent: Item = { id: "camping-tent", locationId: "garage-high-shelf", name: "Camping tent" };

const entries: StuffListEntry[] = [
  { item: passport, segments: [{ id: "bedroom", name: "Bedroom" }] },
  { item: tent, segments: [{ id: "garage", name: "Garage" }] },
];

test("typing a query that matches one item narrows the visible list", async () => {
  const user = userEvent.setup();
  render(<SearchableStuffList entries={entries} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");

  expect(screen.getByText("Camping tent")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
});

test("a query matching nothing shows the no-matches empty state", async () => {
  const user = userEvent.setup();
  render(<SearchableStuffList entries={entries} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "nonexistent");

  expect(screen.getByText("No matches")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
  expect(screen.queryByText("Camping tent")).toBeNull();
});

test("clearing the input restores the full list", async () => {
  const user = userEvent.setup();
  render(<SearchableStuffList entries={entries} />);

  const search = screen.getByRole("searchbox", { name: "Search your stuff" });
  await user.type(search, "tent");
  expect(screen.queryByText("Passport")).toBeNull();

  await user.clear(search);
  expect(screen.getByText("Passport")).toBeDefined();
  expect(screen.getByText("Camping tent")).toBeDefined();
});

test("narrowing the list announces the result count via a status region", async () => {
  const user = userEvent.setup();
  render(<SearchableStuffList entries={entries} />);

  expect(screen.getByRole("status").textContent).toBe("");

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");
  expect(screen.getByRole("status").textContent).toBe("1 result found");
});

test("a query matching nothing announces zero results via the status region", async () => {
  const user = userEvent.setup();
  render(<SearchableStuffList entries={entries} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "nonexistent");
  expect(screen.getByRole("status").textContent).toBe("0 results found");
});
