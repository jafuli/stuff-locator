import { beforeEach, expect, test, vi } from "vitest";
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
const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

// The real write now goes through the browser Supabase client
// (src/server/db/client.ts) — mocked here so these stay fast, offline unit
// tests (the real insert/RLS behavior is covered by
// supabase/tests/items-insert.test.ts against a live local stack instead).
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
  return render(
    <StashForm locationOptions={OPTIONS} locations={LOCATIONS} householdId={HOUSEHOLD_ID} userId={USER_ID} />,
  );
}

test("submitting with nothing shows both specific inline errors, associated to their fields", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.click(screen.getByRole("button", { name: "Add item" }));

  const nameError = screen.getByText("Enter a name for this item.");
  expect(nameError).toBeDefined();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe(nameError.id);

  const locationError = screen.getByText("Choose a location for this item.");
  expect(locationError).toBeDefined();
  expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toBe(locationError.id);
  expect(screen.getByRole("combobox").getAttribute("aria-invalid")).toBe("true");

  // Rejected client-side, before any write is attempted.
  expect(single).not.toHaveBeenCalled();
});

test("picking the '+ New place' row rejects the location instead of silently accepting it", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  // Never silently "succeeds" into the confirmation state.
  expect(screen.queryByRole("status")).toBeNull();
  expect(single).not.toHaveBeenCalled();
});

test("correcting the location after a rejected submit clears the stale error instead of contradicting the new selection", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  expect(screen.getByText("Choose a location for this item.")).toBeDefined();

  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");

  expect(screen.queryByText("Choose a location for this item.")).toBeNull();
  expect(screen.getByText("Selected: Garage › Closet")).toBeDefined();
  expect(screen.getByRole("combobox").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toBeNull();
});

test("a valid fill-and-submit inserts via Supabase and shows the success panel with the real inserted row", async () => {
  single.mockResolvedValueOnce({
    data: {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Bike pump",
      location_id: "garage-closet",
      detail: "Top shelf, behind the shoebox",
      household_id: HOUSEHOLD_ID,
      added_by: USER_ID,
    },
    error: null,
  });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.type(screen.getByLabelText("Detail (optional)"), "Top shelf, behind the shoebox");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(status.textContent).toContain("Garage");
  expect(status.textContent).toContain("Closet");
  expect(status.textContent).toContain("Top shelf, behind the shoebox");
  expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  // The real inserted id, not an echo of form input — AC #3.
  expect(screen.getByRole("link", { name: "View item" }).getAttribute("href")).toBe(
    "/items/33333333-3333-3333-3333-333333333333",
  );
});

test("a rejected insert shows a specific error and leaves the form populated for retry", async () => {
  single.mockResolvedValueOnce({ data: null, error: { message: "new row violates row-level security policy" } });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.type(screen.getByLabelText("Detail (optional)"), "Top shelf, behind the shoebox");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const error = await screen.findByText("new row violates row-level security policy");
  expect(error.getAttribute("role")).toBe("alert");
  // Never silently drops into the success panel on failure.
  expect(screen.queryByRole("status")).toBeNull();

  // Entered values survive the failed submit — the user can just retry.
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bike pump");
  expect(screen.getByText("Selected: Garage › Closet")).toBeDefined();
  expect(screen.getByLabelText<HTMLInputElement>("Detail (optional)").value).toBe("Top shelf, behind the shoebox");
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

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const submitButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Adding…" });
  expect(submitButton.disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Name").disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Detail (optional)").disabled).toBe(true);

  resolveInsert({
    data: {
      id: "44444444-4444-4444-4444-444444444444",
      name: "Bike pump",
      location_id: "garage-closet",
      detail: null,
      household_id: HOUSEHOLD_ID,
      added_by: USER_ID,
    },
    error: null,
  });

  await screen.findByRole("status");
});
