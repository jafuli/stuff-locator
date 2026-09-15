import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemEditForm } from "@/components/item-edit-form";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "garage-closet", parentId: "garage", name: "Closet" },
];
const OPTIONS = getFullLocationPaths(LOCATIONS);

const ITEM: Item = {
  id: "bike-pump",
  locationId: "garage",
  name: "Bike pump",
  detail: "Top shelf",
};

test("pre-fills the form from the given item", () => {
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bike pump");
  expect(screen.getByLabelText("Detail (optional)")).toHaveProperty("value", "Top shelf");
  expect(screen.getByText("Selected: Garage")).toBeDefined();
});

test("submitting with an empty name shows a specific inline error, associated to the field", async () => {
  const user = userEvent.setup();
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.clear(screen.getByLabelText("Name"));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const nameError = screen.getByText("Enter a name for this item.");
  expect(nameError).toBeDefined();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe(nameError.id);
  expect(screen.queryByRole("status")).toBeNull();
});

test("typing a new location without selecting it invalidates the pre-filled selection instead of silently keeping it", async () => {
  const user = userEvent.setup();
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  // Starts pre-filled with the item's current location.
  expect(screen.getByText("Selected: Garage")).toBeDefined();

  await user.type(screen.getByRole("combobox"), "Closet");
  // The stale "Selected: Garage" caption disappears the moment typing
  // diverges from a confirmed selection — no on-screen contradiction
  // between what the combobox shows and what's actually selected.
  expect(screen.queryByText("Selected: Garage")).toBeNull();

  // Never actually selected a suggestion — submitting must fail, not
  // silently keep using the original ("Garage") location.
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("clearing the location and picking the '+ New place' row rejects it instead of silently accepting it", async () => {
  const user = userEvent.setup();
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("a valid edit shows the success panel with the updated name, full breadcrumb, and detail", async () => {
  const user = userEvent.setup();
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Bike pump (blue)");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Bike pump (blue)");
  expect(status.textContent).toContain("Garage");
  expect(status.textContent).toContain("Closet");
  expect(status.textContent).toContain("Top shelf");
  expect(screen.getByRole("link", { name: "Back to item" }).getAttribute("href")).toBe("/items/bike-pump");
});

test("delete requires confirmation: cancel leaves the item unchanged", async () => {
  const user = userEvent.setup();
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.click(screen.getByRole("button", { name: "Delete item" }));
  expect(screen.getByRole("heading", { name: "Delete this item?" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  // Back to the ordinary form — the pre-filled name is still there, untouched.
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bike pump");
  expect(screen.queryByRole("status")).toBeNull();
});

test("confirming delete shows a success state with a way back to Home", async () => {
  const user = userEvent.setup();
  render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.click(screen.getByRole("button", { name: "Delete item" }));
  // The confirm view replaces the form entirely (not an overlay), so
  // there's exactly one "Delete item" button on screen at this point: the
  // confirm action itself.
  await user.click(screen.getByRole("button", { name: "Delete item" }));

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
});
