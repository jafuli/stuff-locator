import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddLocationForm } from "@/components/add-location-form";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "garage-closet", parentId: "garage", name: "Closet" },
];
const OPTIONS = getFullLocationPaths(LOCATIONS);

test("submitting with an empty name shows a specific inline error", async () => {
  const user = userEvent.setup();
  render(<AddLocationForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.click(screen.getByRole("button", { name: "Add location" }));

  const nameError = screen.getByText("Enter a name for this location.");
  expect(nameError).toBeDefined();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe(nameError.id);
  // Never silently "succeeds" into the confirmation state.
  expect(screen.queryByRole("status")).toBeNull();
});

test("submitting with a name and no parent selected succeeds — an empty parent is valid, not an error", async () => {
  const user = userEvent.setup();
  render(<AddLocationForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.type(screen.getByLabelText("Name"), "Attic");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Attic");
  // No parent chosen: the breadcrumb is just the new name, no ancestor path.
  expect(status.textContent.includes("›")).toBe(false);
});

test("picking the '+ New place' row for the parent rejects it instead of silently accepting it", async () => {
  const user = userEvent.setup();
  render(<AddLocationForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.type(screen.getByLabelText("Name"), "Attic");
  await user.type(screen.getByRole("combobox"), "Basement");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("a valid fill-and-submit with an existing parent shows the success panel with the full breadcrumb path", async () => {
  const user = userEvent.setup();
  render(<AddLocationForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.type(screen.getByLabelText("Name"), "Red box");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Red box");
  expect(status.textContent).toContain("Garage › Closet › Red box");
  expect(screen.getByRole("link", { name: "Back to Browse" }).getAttribute("href")).toBe("/browse");
});
