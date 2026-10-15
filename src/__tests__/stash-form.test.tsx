import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StashForm } from "@/components/stash-form";
import type { Location } from "@/lib/fixtures/types";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "garage-closet", parentId: "garage", name: "Closet" },
];
const USER_ID = "22222222-2222-2222-2222-222222222222";
const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";

// The real write goes through the browser Supabase client
// (src/server/db/client.ts) — mocked here so these stay fast, offline unit
// tests. The function's real behavior (one transaction, uniqueness, RLS) is
// covered against a live local stack in supabase/tests/stash-item-rpc.test.ts.
const rpc = vi.fn();
vi.mock("@/server/db/client", () => ({
  createClient: () => ({ rpc }),
}));

beforeEach(() => {
  rpc.mockReset();
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

function renderForm(props: Partial<React.ComponentProps<typeof StashForm>> = {}) {
  return render(<StashForm locations={LOCATIONS} {...props} />);
}

/** Picks "Garage › Closet" the way a person would: type, arrow, Enter. */
async function pickCloset(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
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

test("text typed into the place field that never became a chip is rejected, not silently dropped", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.type(screen.getByRole("combobox"), "Attic");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  expect(screen.getByText("Choose a location for this item.")).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test("choosing a place after a rejected submit clears the stale error", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  expect(screen.getByText("Choose a location for this item.")).toBeDefined();

  await pickCloset(user);

  expect(screen.queryByText("Choose a location for this item.")).toBeNull();
  expect(screen.getByRole("group", { name: "Location: Garage › Closet" })).toBeDefined();
  expect(screen.getByRole("combobox").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("combobox").getAttribute("aria-describedby")).toBeNull();
});

test("a valid fill-and-submit calls stash_item with the place id and shows the real returned row", async () => {
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
  await pickCloset(user);
  await user.type(screen.getByLabelText("Detail (optional)"), "Top shelf, behind the shoebox");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(status.textContent).toContain("Garage");
  expect(status.textContent).toContain("Closet");
  expect(status.textContent).toContain("Top shelf, behind the shoebox");
  expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  // The real returned id, not an echo of form input.
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
  await pickCloset(user);
  await user.type(screen.getByLabelText("Detail (optional)"), "   ");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("status");
  expect(rpc).toHaveBeenCalledWith("stash_item", { p_name: "Bike pump", p_location_id: "garage-closet" });
});

test("a nested new path is one call: the deepest existing place plus the new levels", async () => {
  rpc.mockResolvedValueOnce({
    data: stashedRow({
      id: "66666666-6666-6666-6666-666666666666",
      name: "Camping tent",
      location_id: "55555555-5555-5555-5555-555555555555",
    }),
    error: null,
  });
  const onStashed = vi.fn();

  const user = userEvent.setup();
  renderForm({ onStashed });

  await user.type(screen.getByLabelText("Name"), "Camping tent");
  await pickCloset(user);
  await user.type(screen.getByRole("combobox"), "Toolbox");
  await user.click(screen.getByRole("option", { name: "New place 'Toolbox' inside Garage › Closet" }));
  await user.type(screen.getByRole("combobox"), "Red box");
  await user.click(screen.getByRole("option", { name: "New place 'Red box' inside Garage › Closet › Toolbox" }));
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  // One call, not "create the places, then the item": that pair is what let
  // a retry create the places twice.
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("stash_item", {
    p_name: "Camping tent",
    p_location_id: "garage-closet",
    p_new_path: ["Toolbox", "Red box"],
  });
  // The success panel names every level, including the ones just created.
  expect(status.textContent).toContain("Garage › Closet › Toolbox › Red box");
  expect(onStashed).toHaveBeenCalledWith({
    itemId: "66666666-6666-6666-6666-666666666666",
    locationId: "55555555-5555-5555-5555-555555555555",
  });
});

test("a brand-new household builds its whole path from nothing: no location id, all levels new", async () => {
  rpc.mockResolvedValueOnce({ data: stashedRow({ location_id: "new-leaf" }), error: null });

  const user = userEvent.setup();
  render(<StashForm locations={[]} />);

  await user.type(screen.getByLabelText("Name"), "Passport");
  await user.type(screen.getByRole("combobox"), "Office");
  await user.click(screen.getByRole("option", { name: "New place 'Office' at the top level" }));
  await user.type(screen.getByRole("combobox"), "Cabinet");
  await user.click(screen.getByRole("option", { name: "New place 'Cabinet' inside Office" }));
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("status");
  expect(rpc).toHaveBeenCalledWith("stash_item", { p_name: "Passport", p_new_path: ["Office", "Cabinet"] });
});

test("onStashed fires once, right after a real stash succeeds", async () => {
  rpc.mockResolvedValueOnce({ data: stashedRow(), error: null });
  const onStashed = vi.fn();

  const user = userEvent.setup();
  renderForm({ onStashed });

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await pickCloset(user);
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("status");
  expect(onStashed).toHaveBeenCalledTimes(1);
  expect(onStashed).toHaveBeenCalledWith({
    itemId: "44444444-4444-4444-4444-444444444444",
    locationId: "garage-closet",
  });
});

test("embedded: the success panel confirms the item but offers no navigation of its own", async () => {
  rpc.mockResolvedValueOnce({ data: stashedRow(), error: null });

  const user = userEvent.setup();
  renderForm({ embedded: true });

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await pickCloset(user);
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(screen.queryByRole("link", { name: "View item" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back to home" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
});

test("the placeholder hint shows while no place is chosen", () => {
  renderForm({ locationPlaceholder: "e.g. Office, then Cabinet…" });
  expect(screen.getByPlaceholderText("e.g. Office, then Cabinet…")).toBeDefined();
});

test("onStashed does not fire when the stash is rejected", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "stash_item: location not found or not accessible" } });
  const onStashed = vi.fn();

  const user = userEvent.setup();
  renderForm({ onStashed });

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await pickCloset(user);
  await user.click(screen.getByRole("button", { name: "Add item" }));

  await screen.findByRole("alert");
  expect(onStashed).not.toHaveBeenCalled();
});

test("a rejected stash shows a specific error and leaves the form populated for retry", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "stash_item: location not found or not accessible" } });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByLabelText("Name"), "Bike pump");
  await pickCloset(user);
  await user.type(screen.getByLabelText("Detail (optional)"), "Top shelf, behind the shoebox");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const error = await screen.findByText("stash_item: location not found or not accessible");
  expect(error.getAttribute("role")).toBe("alert");
  // Never silently drops into the success panel on failure.
  expect(screen.queryByRole("status")).toBeNull();

  // Entered values survive the failed submit — the user can just retry.
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bike pump");
  expect(screen.getByRole("group", { name: "Location: Garage › Closet" })).toBeDefined();
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
  await pickCloset(user);
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const submitButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Adding…" });
  expect(submitButton.disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Name").disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Detail (optional)").disabled).toBe(true);
  expect(screen.getByRole<HTMLInputElement>("combobox").disabled).toBe(true);

  resolveInsert({ data: stashedRow(), error: null });

  await screen.findByRole("status");
});
