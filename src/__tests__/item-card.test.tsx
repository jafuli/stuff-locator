import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "@/components/item-card";
import type { Item } from "@/lib/fixtures/types";

const baseItem: Item = {
  id: "spare-house-keys",
  locationId: "garage-closet-toolbox-red-box",
  name: "Spare house keys",
  lastMovedAt: new Date(),
};

test("renders the name, full path, and links to the given href", () => {
  render(<ItemCard item={baseItem} path={["Garage", "Closet", "Toolbox", "Red box"]} href="/items/spare-house-keys" />);
  expect(screen.getByText("Spare house keys")).toBeDefined();
  expect(screen.getByText("Garage › Closet › Toolbox › Red box")).toBeDefined();
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/items/spare-house-keys");
});

test("renders the free-text detail when present", () => {
  const withDetail: Item = { ...baseItem, id: "passport", name: "Passport", detail: "with the birth certificates" };
  render(<ItemCard item={withDetail} path={["Bedroom", "Filing box"]} href="/items/passport" />);
  expect(screen.getByText("with the birth certificates")).toBeDefined();
});

test("omits the detail line when there is none", () => {
  render(<ItemCard item={baseItem} path={["Garage", "Closet", "Toolbox", "Red box"]} href="/items/spare-house-keys" />);
  expect(screen.queryByText(/with the/)).toBeNull();
});
