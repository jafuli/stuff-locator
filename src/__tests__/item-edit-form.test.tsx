import { beforeEach, expect, test, vi } from "vitest";
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

// The real writes go through the browser Supabase client
// (src/server/db/client.ts) — mocked here so these stay fast, offline unit
// tests. update_item / delete_item's real behavior (one transaction, events,
// membership checks) is covered against a live local stack in
// supabase/tests/activity-events.test.ts.
const rpc = vi.fn();
vi.mock("@/server/db/client", () => ({
  createClient: () => ({ rpc }),
}));

beforeEach(() => {
  rpc.mockReset();
});

function renderForm() {
  return render(<ItemEditForm item={ITEM} locationOptions={OPTIONS} locations={LOCATIONS} />);
}

test("pre-fills the form from the given item", () => {
  renderForm();

  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bike pump");
  expect(screen.getByLabelText("Detail (optional)")).toHaveProperty("value", "Top shelf");
  expect(screen.getByText("Selected: Garage")).toBeDefined();
});

test("submitting with an empty name shows a specific inline error, associated to the field", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.clear(screen.getByLabelText("Name"));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const nameError = screen.getByText("Enter a name for this item.");
  expect(nameError).toBeDefined();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBe(nameError.id);
  expect(screen.queryByRole("status")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test("typing a new location without selecting it invalidates the pre-filled selection instead of silently keeping it", async () => {
  const user = userEvent.setup();
  renderForm();

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
  renderForm();

  await user.type(screen.getByRole("combobox"), "Attic");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(
    screen.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("a save is ONE update_item call carrying name, detail and the place", async () => {
  rpc.mockResolvedValueOnce({
    data: { id: "bike-pump", name: "Bike pump (blue)", detail: "Top shelf", location_id: "garage" },
    error: null,
  });

  const user = userEvent.setup();
  renderForm();

  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Bike pump (blue)");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump (blue)");
  expect(status.textContent).toContain("Garage");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("update_item", {
    p_item_id: "bike-pump",
    p_name: "Bike pump (blue)",
    p_detail: "Top shelf",
    p_location_id: "garage",
  });
});

test("changing name and location together is still a single call, showing the real combined result", async () => {
  rpc.mockResolvedValueOnce({
    data: { id: "bike-pump", name: "Bike pump (blue)", detail: "Top shelf", location_id: "garage-closet" },
    error: null,
  });

  const user = userEvent.setup();
  renderForm();

  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Bike pump (blue)");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump (blue)");
  expect(status.textContent).toContain("Garage");
  expect(status.textContent).toContain("Closet");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("update_item", {
    p_item_id: "bike-pump",
    p_name: "Bike pump (blue)",
    p_detail: "Top shelf",
    p_location_id: "garage-closet",
  });
});

test("clearing the detail omits it from the call, which is how update_item clears it", async () => {
  rpc.mockResolvedValueOnce({
    data: { id: "bike-pump", name: "Bike pump", detail: null, location_id: "garage" },
    error: null,
  });

  const user = userEvent.setup();
  renderForm();

  await user.clear(screen.getByLabelText("Detail (optional)"));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await screen.findByRole("status");
  expect(rpc).toHaveBeenCalledWith("update_item", {
    p_item_id: "bike-pump",
    p_name: "Bike pump",
    p_location_id: "garage",
  });
});

test("a rejected save shows its own specific error and no success state", async () => {
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "update_item: item and destination location belong to different households" },
  });

  const user = userEvent.setup();
  renderForm();

  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const error = await screen.findByText("update_item: item and destination location belong to different households");
  expect(error.getAttribute("role")).toBe("alert");
  expect(screen.queryByRole("status")).toBeNull();
  // Entered values survive for a retry.
  expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bike pump");
});

test("delete requires confirmation: cancel leaves the item unchanged", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.click(screen.getByRole("button", { name: "Delete item" }));
  expect(screen.getByRole("heading", { name: "Delete this item?" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  // Back to the ordinary form — the pre-filled name is still there, untouched.
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Bike pump");
  expect(screen.queryByRole("status")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test("confirming delete calls delete_item and shows a success state with a way back to Home", async () => {
  rpc.mockResolvedValueOnce({ data: { id: "bike-pump" }, error: null });

  const user = userEvent.setup();
  renderForm();

  await user.click(screen.getByRole("button", { name: "Delete item" }));
  // The confirm view replaces the form entirely (not an overlay), so
  // there's exactly one "Delete item" button on screen at this point: the
  // confirm action itself.
  await user.click(screen.getByRole("button", { name: "Delete item" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Bike pump");
  expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("delete_item", { p_item_id: "bike-pump" });
});

test("a rejected delete shows a specific error and stays in the confirmation view, not a false success", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "delete_item: item not found or not accessible" } });

  const user = userEvent.setup();
  renderForm();

  await user.click(screen.getByRole("button", { name: "Delete item" }));
  await user.click(screen.getByRole("button", { name: "Delete item" }));

  const error = await screen.findByText("delete_item: item not found or not accessible");
  expect(error.getAttribute("role")).toBe("alert");
  expect(screen.getByRole("heading", { name: "Delete this item?" })).toBeDefined();
  expect(screen.queryByRole("status")).toBeNull();
});

test("the save button shows a loading state and disables fields while in flight", async () => {
  let resolveUpdate: (value: { data: unknown; error: null }) => void = () => undefined;
  rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
  );

  const user = userEvent.setup();
  renderForm();

  await user.clear(screen.getByLabelText("Name"));
  await user.type(screen.getByLabelText("Name"), "Bike pump (blue)");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const submitButton = await screen.findByRole<HTMLButtonElement>("button", { name: "Saving…" });
  expect(submitButton.disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>("Name").disabled).toBe(true);

  resolveUpdate({
    data: { id: "bike-pump", name: "Bike pump (blue)", detail: "Top shelf", location_id: "garage" },
    error: null,
  });
  await screen.findByRole("status");
});
