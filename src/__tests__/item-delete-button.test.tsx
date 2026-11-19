import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemDeleteButton } from "@/components/item-delete-button";

// delete_item's real behaviour (one transaction, the "deleted" event,
// membership checks) is covered against a live stack in supabase/tests/.
const rpc = vi.fn();
vi.mock("@/server/db/client", () => ({
  createClient: () => ({ rpc }),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

beforeEach(() => {
  rpc.mockReset();
  replace.mockReset();
  refresh.mockReset();
});

const ITEM = { id: "bike-pump", name: "Bike pump", locationId: "garage" };

test("is an icon button whose accessible name says what it deletes", () => {
  render(<ItemDeleteButton item={ITEM} />);

  const trigger = screen.getByRole("button", { name: "Delete Bike pump" });
  expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(trigger.className).toContain("text-signal");
  expect(trigger.className).toContain("focus-ring");
});

test("opens a confirm dialog with focus on Cancel; Cancel closes it, deletes nothing and returns focus", async () => {
  const user = userEvent.setup();
  render(<ItemDeleteButton item={ITEM} />);

  const trigger = screen.getByRole("button", { name: "Delete Bike pump" });
  await user.click(trigger);

  expect(screen.getByRole("dialog", { name: "Delete “Bike pump”?" })).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});

test("Escape closes the dialog without deleting", async () => {
  const user = userEvent.setup();
  render(<ItemDeleteButton item={ITEM} />);

  await user.click(screen.getByRole("button", { name: "Delete Bike pump" }));
  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});

test("a tap on the backdrop closes the dialog without deleting, like the delete-place dialog", async () => {
  const user = userEvent.setup();
  render(<ItemDeleteButton item={ITEM} />);

  const trigger = screen.getByRole("button", { name: "Delete Bike pump" });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Close dialog" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});

test("the backdrop can't close the dialog while the delete is in flight", async () => {
  // Never settles: the delete stays in flight for the rest of the test.
  rpc.mockReturnValueOnce(new Promise(() => undefined));
  const user = userEvent.setup();
  render(<ItemDeleteButton item={ITEM} />);

  await user.click(screen.getByRole("button", { name: "Delete Bike pump" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Close dialog" }));

  expect(screen.getByRole("dialog", { name: "Delete “Bike pump”?" })).toBeDefined();
});

test("confirming calls delete_item and replaces the page with the item's place, naming it", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: null });
  const user = userEvent.setup();
  render(<ItemDeleteButton item={ITEM} />);

  await user.click(screen.getByRole("button", { name: "Delete Bike pump" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(rpc).toHaveBeenCalledWith("delete_item", { p_item_id: "bike-pump" });
  // replace, not push: Back and reload never reach a page for the deleted item.
  expect(replace).toHaveBeenCalledWith("/browse/garage?deleted=Bike%20pump");
  expect(refresh).toHaveBeenCalledTimes(1);
  // Still "Deleting…" while the navigation lands, so it can't be pressed twice.
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Deleting…" }).disabled).toBe(true);
});

test("a rejected delete shows its error inside the dialog and stays put", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "delete_item: item not found or not accessible" } });
  const user = userEvent.setup();
  render(<ItemDeleteButton item={ITEM} />);

  await user.click(screen.getByRole("button", { name: "Delete Bike pump" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));

  const error = await screen.findByText("delete_item: item not found or not accessible");
  expect(error.getAttribute("role")).toBe("alert");
  expect(screen.getByRole("dialog")).toBeDefined();
  expect(replace).not.toHaveBeenCalled();
  // And it can be tried again.
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Delete" }).disabled).toBe(false);
});
