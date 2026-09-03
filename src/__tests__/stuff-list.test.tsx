import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuffList, type StuffListEntry } from "@/components/stuff-list";
import type { Item } from "@/lib/fixtures/types";

const item: Item = {
  id: "spare-house-keys",
  locationId: "garage-closet-toolbox-red-box",
  name: "Spare house keys",
  lastMovedAt: new Date(),
};

const entries: StuffListEntry[] = [{ item, path: ["Garage", "Closet", "Toolbox", "Red box"] }];

test("renders the empty state when there are no entries", () => {
  render(<StuffList entries={[]} />);
  expect(screen.getByText("No items yet")).toBeDefined();
  expect(screen.getByText("Stash your first thing to see it here.")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});

test("renders one ItemCard per entry, linked by item id", () => {
  render(<StuffList entries={entries} />);
  expect(screen.getByText("Spare house keys")).toBeDefined();
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/items/spare-house-keys");
});
