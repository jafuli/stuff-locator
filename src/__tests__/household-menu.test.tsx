import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signOut, getSession, getUser, onAuthStateChange, householdRead, profileRead } = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  householdRead: vi.fn(),
  profileRead: vi.fn(),
}));
// The household row (with its members), then a profile: the owner's for
// the title, and the caller's own for DisplayNameEditor.
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    auth: { signOut, getSession, getUser, onAuthStateChange },
    from: (table: string) => ({
      select: () =>
        table === "households"
          ? { limit: () => ({ maybeSingle: householdRead }) }
          : { eq: () => ({ maybeSingle: profileRead }) },
    }),
  }),
}));

import { HouseholdMenu } from "@/components/household-menu";

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signOut.mockReset();
  getSession.mockReset();
  getUser.mockReset();
  householdRead.mockReset();
  profileRead.mockReset();
});

/** A signed-in owner, "Noa Levi"; `householdName` is a name someone chose (null: none). */
function withSession(household: { name: string | null } | null = { name: null }): void {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  getUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
  householdRead.mockResolvedValue({
    data:
      household === null ? null : { name: household.name, household_members: [{ user_id: "owner-1", role: "owner" }] },
  });
  profileRead.mockResolvedValue({ data: { display_name: "Noa Levi" } });
}

test("renders nothing without a session", async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  householdRead.mockResolvedValue({ data: null });
  const { container } = render(<HouseholdMenu />);
  await waitFor(() => {
    expect(getSession).toHaveBeenCalled();
  });
  expect(container.firstChild).toBeNull();
});

test("the button shows the owner's initial and is labelled for assistive tech", async () => {
  withSession();
  render(<HouseholdMenu />);
  const button = await screen.findByRole("button", { name: "Household menu" });
  await waitFor(() => {
    expect(button.textContent).toBe("N");
  });
  expect(button.getAttribute("aria-expanded")).toBe("false");
});

test("an unnamed household is titled after its owner", async () => {
  withSession();
  const user = userEvent.setup();
  render(<HouseholdMenu />);
  const button = await screen.findByRole("button", { name: "Household menu" });
  await waitFor(() => {
    expect(button.textContent).toBe("N");
  });
  await user.click(button);
  expect(screen.getByRole("dialog", { name: "Noa's household" })).toBeDefined();
});

test("a chosen household name is the title, but the initial stays the owner's", async () => {
  withSession({ name: "Shared home" });
  const user = userEvent.setup();
  render(<HouseholdMenu />);
  const button = await screen.findByRole("button", { name: "Household menu" });
  await waitFor(() => {
    expect(button.textContent).toBe("N");
  });
  await user.click(button);
  expect(screen.getByRole("dialog", { name: "Shared home" })).toBeDefined();
});

test("falls back to H when the household can't be read", async () => {
  withSession(null);
  render(<HouseholdMenu />);
  expect((await screen.findByRole("button", { name: "Household menu" })).textContent).toBe("H");
});

test("opens a sheet with Invite partner and Sign out (no Settings row yet), and Escape returns focus to the button", async () => {
  withSession({ name: "Shared home" });
  const user = userEvent.setup();
  render(<HouseholdMenu />);
  const button = await screen.findByRole("button", { name: "Household menu" });
  await waitFor(() => {
    expect(button.textContent).toBe("N");
  });

  await user.click(button);
  const sheet = screen.getByRole("dialog", { name: "Shared home" });
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "Invite partner" }).getAttribute("href")).toBe("/settings/invite");
  expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeDefined();
  // Focus moved into the sheet, onto its first row.
  expect(sheet.contains(document.activeElement)).toBe(true);

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(button);
});

test("Sign out signs out and sends you to /sign-in", async () => {
  withSession();
  signOut.mockResolvedValue({ error: null });
  const user = userEvent.setup();
  render(<HouseholdMenu />);

  await user.click(await screen.findByRole("button", { name: "Household menu" }));
  await user.click(screen.getByRole("button", { name: "Sign out" }));

  expect(signOut).toHaveBeenCalled();
  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/sign-in");
  });
});

test("choosing Invite partner closes the sheet", async () => {
  withSession();
  const user = userEvent.setup();
  render(<HouseholdMenu />);

  await user.click(await screen.findByRole("button", { name: "Household menu" }));
  await user.click(screen.getByRole("link", { name: "Invite partner" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
