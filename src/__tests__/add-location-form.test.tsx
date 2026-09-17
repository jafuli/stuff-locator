import { beforeEach, expect, test, vi } from "vitest";
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
const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";

// The real write now goes through the browser Supabase client
// (src/server/db/client.ts) — mocked here so these stay fast, offline unit
// tests (the real insert/RLS/trigger behavior is covered by
// supabase/tests/locations-insert.test.ts against a live local stack
// instead).
const single = vi.fn();
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({ single }),
      }),
    }),
  }),
}));

beforeEach(() => {
  single.mockReset();
});

function renderForm() {
  return render(<AddLocationForm locationOptions={OPTIONS} locations={LOCATIONS} householdId={HOUSEHOLD_ID} />);
}

test("submitting with an empty name shows a specific inline error", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.click(screen.getByRole("button", { name: "Add location" }));

  const nameError = screen.getByText("Enter a name for this location.");
  expect(nameError).toBeDefined();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe(nameError.id);
  // Never silently "succeeds" into the confirmation state.
  expect(screen.queryByRole("status")).toBeNull();
  expect(single).not.toHaveBeenCalled();
});

test("submitting with a name and no parent selected inserts a null parent_id and succeeds", async () => {
  single.mockResolvedValueOnce({
    data: { id: "55555555-5555-5555-5555-555555555555", name: "Attic", parent_id: null, household_id: HOUSEHOLD_ID },
    error: null,
  });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Attic");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Attic");
  // No parent chosen: the breadcrumb is just the new name, no ancestor path.
  expect(status.textContent.includes("›")).toBe(false);
});

test("picking the '+ New place' row for the parent rejects it instead of silently accepting it", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Attic");
  await user.type(screen.getByRole("combobox"), "Basement");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
  expect(single).not.toHaveBeenCalled();
});

test("a valid fill-and-submit with an existing parent inserts via Supabase and shows the real breadcrumb path", async () => {
  single.mockResolvedValueOnce({
    data: {
      id: "66666666-6666-6666-6666-666666666666",
      name: "Red box",
      parent_id: "garage-closet",
      household_id: HOUSEHOLD_ID,
    },
    error: null,
  });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Red box");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Red box");
  expect(status.textContent).toContain("Garage › Closet › Red box");
  expect(screen.getByRole("link", { name: "Back to Browse" }).getAttribute("href")).toBe("/browse");
});

test("a rejected insert shows a specific error and leaves the form populated for retry", async () => {
  single.mockResolvedValueOnce({
    data: null,
    error: { message: "locations: parent_id must belong to the same household as the location (household_id)" },
  });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Red box");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  const error = await screen.findByText(
    "locations: parent_id must belong to the same household as the location (household_id)",
  );
  expect(error.getAttribute("role")).toBe("alert");
  // Never silently drops into the success panel on failure.
  expect(screen.queryByRole("status")).toBeNull();

  // Entered values survive the failed submit — the user can just retry.
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Red box");
  expect(screen.getByText("Selected: Garage › Closet")).toBeDefined();
});

test("the button shows a loading state and disables fields while the insert is in flight", async () => {
  let resolveInsert: (value: { data: unknown; error: null }) => void = () => undefined;
  single.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveInsert = resolve;
      }),
  );

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Red box");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add location" }));

  const submitButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Adding…" });
  expect(submitButton.disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Name").disabled).toBe(true);
  expect(screen.getByRole<HTMLInputElement>("combobox").disabled).toBe(true);

  resolveInsert({
    data: { id: "77777777-7777-7777-7777-777777777777", name: "Red box", parent_id: "garage-closet", household_id: HOUSEHOLD_ID },
    error: null,
  });

  await screen.findByRole("status");
});
