import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Location } from "@/lib/fixtures/types";

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

const rpc = vi.fn();
vi.mock("@/server/db/client", () => ({ createClient: () => ({ rpc }) }));

import { PlaceManager, describeContents } from "@/components/place-manager";

const LOCATIONS: Location[] = [
  { id: "office", parentId: null, name: "Office" },
  { id: "cabinet", parentId: "office", name: "Cabinet" },
  { id: "drawer", parentId: "cabinet", name: "Top drawer" },
  { id: "bedroom", parentId: null, name: "Bedroom" },
  { id: "wardrobe", parentId: "bedroom", name: "Wardrobe" },
];

beforeEach(() => {
  rpc.mockReset();
  refresh.mockReset();
  push.mockReset();
});

function renderManager(overrides: Partial<React.ComponentProps<typeof PlaceManager>> = {}) {
  return render(
    <PlaceManager
      place={{ id: "cabinet", name: "Cabinet" }}
      afterDeleteHref="/browse/office"
      hasParent
      locations={LOCATIONS}
      itemCount={0}
      placeCount={0}
      {...overrides}
    />,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Manage Cabinet" }));
  return screen.getByRole("menu");
}

describe("describeContents", () => {
  test("joins the non-zero parts with correct plurals", () => {
    expect(describeContents(2, 2)).toBe("2 items and 2 places");
    expect(describeContents(1, 1)).toBe("1 item and 1 place");
    expect(describeContents(3, 0)).toBe("3 items");
    expect(describeContents(0, 1)).toBe("1 place");
  });
});

describe("the ⋯ menu", () => {
  test("is a labelled menu button; it opens Rename / Move into… / Delete and moves focus to the first", async () => {
    const user = userEvent.setup();
    renderManager();

    const trigger = screen.getByRole("button", { name: "Manage Cabinet" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    const menu = await openMenu(user);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Rename", "Move into…Everything inside moves with it", "Delete"]);
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Rename" }));
  });

  test("arrow keys move between items and wrap; Escape closes and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderManager();
    const menu = await openMenu(user);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: /Move into/ }));
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Delete" }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Manage Cabinet" }));
  });
});

describe("Rename", () => {
  async function startRename(user: ReturnType<typeof userEvent.setup>) {
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    return screen.getByLabelText("Place name");
  }

  test("the heading becomes a focused input; Enter saves through rename_location and refreshes", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "cabinet", name: "Filing cabinet" }, error: null });
    const user = userEvent.setup();
    renderManager();

    const input = await startRename(user);
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("heading", { level: 1 }).contains(input)).toBe(true);

    await user.clear(input);
    await user.type(input, "  Filing   cabinet {Enter}");

    expect(rpc).toHaveBeenCalledWith("rename_location", { p_location_id: "cabinet", p_name: "Filing cabinet" });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByLabelText("Place name")).toBeNull();
  });

  test("Escape cancels without calling anything", async () => {
    const user = userEvent.setup();
    renderManager();

    const input = await startRename(user);
    await user.type(input, " edited");
    await user.keyboard("{Escape}");

    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Cabinet");
  });

  test("a duplicate sibling shows the plain message and stays in edit mode", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });
    const user = userEvent.setup();
    renderManager();

    const input = await startRename(user);
    await user.clear(input);
    await user.type(input, "Drawer unit{Enter}");

    expect(await screen.findByText("You already have “Drawer unit” here.")).toBeDefined();
    expect(screen.getByLabelText("Place name")).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("saving the unchanged name just closes; an empty name is rejected", async () => {
    const user = userEvent.setup();
    renderManager();

    let input = await startRename(user);
    await user.keyboard("{Enter}");
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Place name")).toBeNull();

    input = await startRename(user);
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(screen.getByText("Enter a name for this place.")).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("Move into…", () => {
  async function openMove(user: ReturnType<typeof userEvent.setup>) {
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: /Move into/ }));
    return screen.getByRole("dialog", { name: "Move “Cabinet” into…" });
  }

  test("is a pick-only picker that never offers the place itself or anything inside it", async () => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await openMove(user);

    await user.type(within(dialog).getByRole("combobox"), "r");

    // "Top drawer" is inside Cabinet, "Office › Cabinet" is Cabinet: neither is offered.
    const options = screen.getAllByRole("option").map((option) => option.getAttribute("aria-label"));
    expect(options).toContain("Bedroom");
    expect(options).not.toContain("Office › Cabinet");
    expect(options).not.toContain("Office › Cabinet › Top drawer");
    expect(screen.queryByRole("option", { name: /^New place/ })).toBeNull();
  });

  test("Move calls move_container with the chosen parent, closes and refreshes", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "cabinet" }, error: null });
    const user = userEvent.setup();
    renderManager();
    const dialog = await openMove(user);

    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "Move" }).disabled).toBe(true);
    await user.type(within(dialog).getByRole("combobox"), "wardrobe");
    await user.click(screen.getByRole("option", { name: "Bedroom › Wardrobe" }));
    await user.click(within(dialog).getByRole("button", { name: "Move" }));

    expect(rpc).toHaveBeenCalledWith("move_container", { p_location_id: "cabinet", p_new_parent_id: "wardrobe" });
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("'Top level' moves with no parent argument, and only appears for a place that has a parent", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "cabinet" }, error: null });
    const user = userEvent.setup();
    renderManager();
    const dialog = await openMove(user);

    await user.click(within(dialog).getByRole("button", { name: "Top level" }));

    expect(rpc).toHaveBeenCalledWith("move_container", { p_location_id: "cabinet" });
  });

  test("a top-level place has no 'Top level' button", async () => {
    const user = userEvent.setup();
    renderManager({ hasParent: false, place: { id: "office", name: "Office" } });
    await user.click(screen.getByRole("button", { name: "Manage Office" }));
    await user.click(screen.getByRole("menuitem", { name: /Move into/ }));

    expect(screen.queryByRole("button", { name: "Top level" })).toBeNull();
  });

  test("a cycle error and a duplicate-name error are mapped to plain messages", async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: "P0001", message: "move_container: cannot move a location under its own descendant" },
      })
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } });
    const user = userEvent.setup();
    renderManager();
    const dialog = await openMove(user);

    await user.type(within(dialog).getByRole("combobox"), "wardrobe");
    await user.click(screen.getByRole("option", { name: "Bedroom › Wardrobe" }));
    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(await screen.findByText("“Cabinet” can't go inside itself or a place within it.")).toBeDefined();

    await user.click(within(dialog).getByRole("button", { name: "Move" }));
    expect(await screen.findByText(/already a place with this name there/)).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("Escape closes the dialog and focus returns to the menu button", async () => {
    const user = userEvent.setup();
    renderManager();
    await openMove(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Manage Cabinet" }));
    });
  });
});

describe("Delete", () => {
  async function openDelete(user: ReturnType<typeof userEvent.setup>) {
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
  }

  test("an empty place asks for confirmation, then deletes and navigates to the parent", async () => {
    rpc.mockResolvedValueOnce({ data: { id: "cabinet" }, error: null });
    const user = userEvent.setup();
    renderManager();

    await openDelete(user);
    const dialog = screen.getByRole("dialog", { name: "Delete “Cabinet”?" });
    expect(within(dialog).getByText("It's empty. This can't be undone.")).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(rpc).toHaveBeenCalledWith("delete_container", { p_location_id: "cabinet" });
    expect(push).toHaveBeenCalledWith("/browse/office");
  });

  test("Cancel leaves everything alone", async () => {
    const user = userEvent.setup();
    renderManager();

    await openDelete(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("a place that still holds things explains what, and offers no destructive button", async () => {
    const user = userEvent.setup();
    renderManager({ itemCount: 2, placeCount: 2 });

    // The menu item stays available rather than being disabled without a reason.
    await openDelete(user);

    const dialog = screen.getByRole("dialog", { name: "“Cabinet” isn't empty" });
    expect(within(dialog).getByText("It still holds 2 items and 2 places. Move or delete them first.")).toBeDefined();
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "OK" })).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("a server-side refusal is shown and nothing navigates", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "delete_container: location has items and cannot be deleted" },
    });
    const user = userEvent.setup();
    renderManager();

    await openDelete(user);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/has items and cannot be deleted/)).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
