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

const segments = [
  { id: "garage", name: "Garage" },
  { id: "garage-closet", name: "Closet" },
  { id: "garage-closet-toolbox", name: "Toolbox" },
  { id: "garage-closet-toolbox-red-box", name: "Red box" },
];

test("renders the name, full path, and links to the given href", () => {
  render(<ItemCard item={baseItem} segments={segments} href="/items/spare-house-keys" />);
  expect(screen.getByText("Spare house keys")).toBeDefined();
  expect(screen.getByText("Garage › Closet › Toolbox › Red box")).toBeDefined();
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/items/spare-house-keys");
});

test("renders the free-text detail when present", () => {
  const withDetail: Item = { ...baseItem, id: "passport", name: "Passport", detail: "with the birth certificates" };
  render(<ItemCard item={withDetail} segments={[{ id: "bedroom", name: "Bedroom" }, { id: "bedroom-filing-box", name: "Filing box" }]} href="/items/passport" />);
  expect(screen.getByText("with the birth certificates")).toBeDefined();
});

test("omits the detail line when there is none", () => {
  render(<ItemCard item={baseItem} segments={segments} href="/items/spare-house-keys" />);
  expect(screen.queryByText(/with the/)).toBeNull();
});

test("without linkLocationSegments, the whole row is exactly one link (default, unchanged behavior)", () => {
  render(<ItemCard item={baseItem} segments={segments} href="/items/spare-house-keys" />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/items/spare-house-keys");
});

test("with linkLocationSegments, the item link and each breadcrumb segment are separate links", () => {
  render(
    <ItemCard item={baseItem} segments={segments} href="/items/spare-house-keys" linkLocationSegments />,
  );

  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(1 + segments.length);

  const itemLink = links.find((link) => link.getAttribute("href") === "/items/spare-house-keys");
  expect(itemLink).toBeDefined();

  segments.forEach((segment) => {
    const segmentLink = links.find((link) => link.getAttribute("href") === `/browse/${segment.id}`);
    expect(segmentLink).toBeDefined();
    expect(segmentLink?.textContent).toBe(segment.name);
  });
});
