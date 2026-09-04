import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemDetail } from "@/components/item-detail";
import type { Item } from "@/lib/fixtures/types";

const fullItem: Item = {
  id: "spare-house-keys",
  locationId: "garage-closet-toolbox-red-box",
  name: "Spare house keys",
  detail: "the ones with the blue tag",
  addedBy: "Itamar",
  addedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  lastMovedBy: "Maayan",
  lastMovedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
};

test("renders the item name as the page heading", () => {
  render(<ItemDetail item={fullItem} segments={[{ id: "garage", name: "Garage" }, { id: "garage-closet", name: "Closet" }, { id: "garage-closet-toolbox", name: "Toolbox" }, { id: "garage-closet-toolbox-red-box", name: "Red box" }]} />);
  expect(screen.getByRole("heading", { level: 1, name: "Spare house keys" })).toBeDefined();
});

test("renders the full location breadcrumb", () => {
  render(<ItemDetail item={fullItem} segments={[{ id: "garage", name: "Garage" }, { id: "garage-closet", name: "Closet" }, { id: "garage-closet-toolbox", name: "Toolbox" }, { id: "garage-closet-toolbox-red-box", name: "Red box" }]} />);
  expect(screen.getByText("Garage › Closet › Toolbox › Red box")).toBeDefined();
});

test("renders every optional field when present", () => {
  render(<ItemDetail item={fullItem} segments={[{ id: "garage", name: "Garage" }]} />);
  expect(screen.getByText("Detail")).toBeDefined();
  expect(screen.getByText("the ones with the blue tag")).toBeDefined();
  expect(screen.getByText("Added by")).toBeDefined();
  expect(screen.getByText("Itamar")).toBeDefined();
  expect(screen.getByText("1w ago")).toBeDefined();
  expect(screen.getByText("Last moved by")).toBeDefined();
  expect(screen.getByText("Maayan")).toBeDefined();
  expect(screen.getByText("2d ago")).toBeDefined();
});

test("omits fields that are absent, without any filler", () => {
  const sparse: Item = {
    id: "passport",
    locationId: "bedroom-filing-box",
    name: "Passport",
    detail: "with the birth certificates",
    addedBy: "Itamar",
    addedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    // no lastMovedBy — matches the real "passport" fixture entry
    lastMovedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
  };
  render(<ItemDetail item={sparse} segments={[{ id: "bedroom", name: "Bedroom" }, { id: "bedroom-filing-box", name: "Filing box" }]} />);
  expect(screen.queryByText("Last moved by")).toBeNull();
});

test("renders no field list when the item has no optional fields set", () => {
  const bare: Item = { id: "mystery-box", locationId: "garage", name: "Mystery box" };
  render(<ItemDetail item={bare} segments={[{ id: "garage", name: "Garage" }]} />);
  expect(screen.queryByRole("term")).toBeNull();
});
