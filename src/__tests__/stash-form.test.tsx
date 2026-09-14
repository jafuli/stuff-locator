import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StashForm } from "@/components/stash-form";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "garage-closet", parentId: "garage", name: "Closet" },
];
const OPTIONS = getFullLocationPaths(LOCATIONS);

test("submitting with nothing shows both specific inline errors, associated to their fields", async () => {
  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.click(screen.getByRole("button", { name: "Add item" }));

  const nameError = screen.getByText("Enter a name for this item.");
  expect(nameError).toBeDefined();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe(nameError.id);

  const locationError = screen.getByText("Choose a location for this item.");
  expect(locationError).toBeDefined();
  expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toBe(locationError.id);
  expect(screen.getByRole("combobox").getAttribute("aria-invalid")).toBe("true");
});

test("picking the '+ New place' row rejects the location instead of silently accepting it", async () => {
  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  // Never silently "succeeds" into the confirmation state.
  expect(screen.queryByRole("status")).toBeNull();
});

test("a valid fill-and-submit shows the success panel with the exact name, full breadcrumb, and detail", async () => {
  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} />);

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.type(screen.getByLabelText("Detail (optional)"), "Top shelf, behind the shoebox");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = screen.getByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(status.textContent).toContain("Garage");
  expect(status.textContent).toContain("Closet");
  expect(status.textContent).toContain("Top shelf, behind the shoebox");
  expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
});
