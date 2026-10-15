import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const rpc = vi.fn();
vi.mock("@/server/db/client", () => ({ createClient: () => ({ rpc }) }));

import { AddPlaceHere } from "@/components/add-place-here";

beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
});

async function openField(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "+ Add a place here" }));
  return screen.getByLabelText("Place name");
}

test("starts as a single button with the exact label; clicking reveals a focused name field", async () => {
  const user = userEvent.setup();
  render(<AddPlaceHere parentId={null} />);

  expect(screen.queryByLabelText("Place name")).toBeNull();
  const field = await openField(user);

  expect(document.activeElement).toBe(field);
  expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
});

test("adds at the top level with no parent argument and refreshes the list", async () => {
  rpc.mockResolvedValueOnce({ data: { id: "p1" }, error: null });
  const user = userEvent.setup();
  render(<AddPlaceHere parentId={null} />);

  await user.type(await openField(user), "  Attic  ");
  await user.click(screen.getByRole("button", { name: "Add" }));

  expect(rpc).toHaveBeenCalledWith("create_location", { p_name: "Attic" });
  expect(refresh).toHaveBeenCalled();
  // Collapses back to the button for the next one.
  expect(await screen.findByRole("button", { name: "+ Add a place here" })).toBeDefined();
});

test("adds inside the current place when given a parent", async () => {
  rpc.mockResolvedValueOnce({ data: { id: "p1" }, error: null });
  const user = userEvent.setup();
  render(<AddPlaceHere parentId="cabinet" />);

  await user.type(await openField(user), "Top drawer");
  await user.click(screen.getByRole("button", { name: "Add" }));

  expect(rpc).toHaveBeenCalledWith("create_location", { p_name: "Top drawer", p_parent_id: "cabinet" });
});

test("a duplicate sibling (23505) shows the plain message and keeps the field for correction", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key value" } });
  const user = userEvent.setup();
  render(<AddPlaceHere parentId="cabinet" />);

  await user.type(await openField(user), "top drawer");
  await user.click(screen.getByRole("button", { name: "Add" }));

  expect((await screen.findByText("You already have “top drawer” here.")).getAttribute("id")).toBe(
    screen.getByLabelText("Place name").getAttribute("aria-describedby"),
  );
  expect(screen.getByLabelText<HTMLInputElement>("Place name").value).toBe("top drawer");
  expect(refresh).not.toHaveBeenCalled();
});

test("an empty name is rejected before any call", async () => {
  const user = userEvent.setup();
  render(<AddPlaceHere parentId={null} />);

  await openField(user);
  await user.click(screen.getByRole("button", { name: "Add" }));

  expect(screen.getByText("Enter a name for this place.")).toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});

test("Escape and Cancel collapse the field without saving", async () => {
  const user = userEvent.setup();
  render(<AddPlaceHere parentId={null} />);

  await user.type(await openField(user), "Attic");
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "+ Add a place here" })).toBeDefined();

  await openField(user);
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "+ Add a place here" })).toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});

test("other errors are shown verbatim", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "create_location: boom" } });
  const user = userEvent.setup();
  render(<AddPlaceHere parentId={null} />);

  await user.type(await openField(user), "Attic");
  await user.click(screen.getByRole("button", { name: "Add" }));

  expect(await screen.findByText("create_location: boom")).toBeDefined();
});
