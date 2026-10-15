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
const USER_ID = "22222222-2222-2222-2222-222222222222";
const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";

// The real write goes through the browser Supabase client
// (src/server/db/client.ts) — mocked here so these stay fast, offline unit
// tests. The function's real behavior (one transaction, uniqueness, RLS) is
// covered against a live local stack in supabase/tests/stash-item-rpc.test.ts.
const rpc = vi.fn();
// Read-back of the place a typed new name resolved to (for its canonical name).
const maybeSingle = vi.fn();
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

function stashedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Bike pump",
    location_id: "garage-closet",
    detail: null,
    household_id: HOUSEHOLD_ID,
    added_by: USER_ID,
    ...overrides,
  };
}

function renderForm() {
  return render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} />);
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
  expect(rpc).not.toHaveBeenCalled();
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
  expect(rpc).not.toHaveBeenCalled();
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

test("a valid fill-and-submit calls stash_item and shows the success panel with the real returned row", async () => {
  rpc.mockResolvedValueOnce({
    data: stashedRow({
      id: "33333333-3333-3333-3333-333333333333",
      detail: "Top shelf, behind the shoebox",
    }),
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
  // The real returned id, not an echo of form input — AC #3.
  expect(screen.getByRole("link", { name: "View item" }).getAttribute("href")).toBe(
    "/items/33333333-3333-3333-3333-333333333333",
  );
  // An existing place goes by id, with no new-path argument at all.
  expect(rpc).toHaveBeenCalledWith("stash_item", {
    p_name: "Bike pump",
    p_detail: "Top shelf, behind the shoebox",
    p_location_id: "garage-closet",
  });
});

test("an empty detail is left out of the call rather than sent as an empty string", async () => {
  rpc.mockResolvedValueOnce({ data: stashedRow(), error: null });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "  Bike pump  ");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.type(screen.getByLabelText("Detail (optional)"), "   ");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("status");
  expect(rpc).toHaveBeenCalledWith("stash_item", { p_name: "Bike pump", p_location_id: "garage-closet" });
});

test("onStashed fires once, right after a real stash succeeds", async () => {
  rpc.mockResolvedValueOnce({ data: stashedRow(), error: null });
  const onStashed = vi.fn();

  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} onStashed={onStashed} />);

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("status");
  expect(onStashed).toHaveBeenCalledTimes(1);
  // Picked an existing location, so there is no new one to report.
  expect(onStashed).toHaveBeenCalledWith({
    itemId: "44444444-4444-4444-4444-444444444444",
    createdLocation: undefined,
  });
});

test("with allowNewLocation, a typed new place is sent as one stash_item call carrying a one-level path", async () => {
  rpc.mockResolvedValueOnce({
    data: stashedRow({
      id: "66666666-6666-6666-6666-666666666666",
      name: "Camping tent",
      location_id: "55555555-5555-5555-5555-555555555555",
    }),
    error: null,
  });
  maybeSingle.mockResolvedValueOnce({
    data: { id: "55555555-5555-5555-5555-555555555555", name: "Attic" },
    error: null,
  });

  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} allowNewLocation />);

  await user.type(screen.getByLabelText("Name"), "Camping tent");
  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Camping tent");
  expect(status.textContent).toContain("Attic");
  // One call, not "create the place, then the item": that pair is what let a
  // retry create the place twice.
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("stash_item", { p_name: "Camping tent", p_new_path: ["Attic"] });
});

test("onStashed reports the place a typed new name resolved to, with its canonical name", async () => {
  rpc.mockResolvedValueOnce({
    data: stashedRow({
      id: "66666666-6666-6666-6666-666666666666",
      name: "Camping tent",
      location_id: "55555555-5555-5555-5555-555555555555",
    }),
    error: null,
  });
  // The typed "attic" matched an existing "Attic": the canonical name wins.
  maybeSingle.mockResolvedValueOnce({
    data: { id: "55555555-5555-5555-5555-555555555555", name: "Attic" },
    error: null,
  });
  const onStashed = vi.fn();

  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} allowNewLocation onStashed={onStashed} />);

  await user.type(screen.getByLabelText("Name"), "Camping tent");
  await user.type(screen.getByRole("combobox"), "attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("status");
  expect(onStashed).toHaveBeenCalledWith({
    itemId: "66666666-6666-6666-6666-666666666666",
    createdLocation: { id: "55555555-5555-5555-5555-555555555555", parentId: null, name: "Attic" },
  });
});

test("if reading the resolved place back fails, the saved item still succeeds using the typed name", async () => {
  rpc.mockResolvedValueOnce({
    data: stashedRow({ name: "Camping tent", location_id: "55555555-5555-5555-5555-555555555555" }),
    error: null,
  });
  maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "network" } });

  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} allowNewLocation />);

  await user.type(screen.getByLabelText("Name"), "Camping tent");
  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Attic");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("embedded: the success panel confirms the item but offers no navigation of its own", async () => {
  rpc.mockResolvedValueOnce({ data: stashedRow(), error: null });

  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} embedded />);

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(screen.queryByRole("link", { name: "View item" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back to home" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
});

test("without allowNewLocation, '+ New place' is still rejected (default behavior unchanged)", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Camping tent");
  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});

test("onStashed does not fire when the stash is rejected", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "stash_item: location not found or not accessible" } });
  const onStashed = vi.fn();

  const user = userEvent.setup();
  render(<StashForm locationOptions={OPTIONS} locations={LOCATIONS} onStashed={onStashed} />);

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("alert");
  expect(onStashed).not.toHaveBeenCalled();
});

test("a rejected stash shows a specific error and leaves the form populated for retry", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "stash_item: location not found or not accessible" } });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.type(screen.getByLabelText("Detail (optional)"), "Top shelf, behind the shoebox");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const error = await screen.findByText("stash_item: location not found or not accessible");
  expect(error.getAttribute("role")).toBe("alert");
  // Never silently drops into the success panel on failure.
  expect(screen.queryByRole("status")).toBeNull();

  // Entered values survive the failed submit — the user can just retry.
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bike pump");
  expect(screen.getByText("Selected: Garage › Closet")).toBeDefined();
  expect(screen.getByLabelText<HTMLInputElement>("Detail (optional)").value).toBe("Top shelf, behind the shoebox");
});

test("the button shows a loading state and disables fields while the stash is in flight", async () => {
  let resolveInsert: (value: { data: unknown; error: null }) => void = () => undefined;
  rpc.mockImplementationOnce(
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
  expect(screen.getByRole<HTMLInputElement>("combobox").disabled).toBe(true);

  resolveInsert({ data: stashedRow(), error: null });

  await screen.findByRole("status");
});
