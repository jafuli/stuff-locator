import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signOut, getSession, onAuthStateChange } = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
}));
vi.mock("@/server/db/client", () => ({
  createClient: () => ({ auth: { signOut, getSession, onAuthStateChange } }),
}));

const { clearPrivateCaches } = vi.hoisted(() => ({ clearPrivateCaches: vi.fn() }));
vi.mock("@/lib/offline/clear-private-caches", () => ({ clearPrivateCaches }));

// Static import is safe here for the same reason as site-nav.test.tsx: the
// vi.mock calls above are hoisted above imports.
import { SignOutButton } from "@/components/sign-out-button";

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signOut.mockReset();
  getSession.mockReset();
  onAuthStateChange.mockClear();
  clearPrivateCaches.mockReset();
});

test("renders nothing while there is no active session", async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  render(<SignOutButton />);

  await waitFor(() => {
    expect(getSession).toHaveBeenCalled();
  });
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("renders the control once a session exists", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  render(<SignOutButton />);

  expect(await screen.findByRole("button", { name: "Sign out" })).toBeDefined();
});

test("clicking sign out calls supabase.auth.signOut and redirects to /sign-in", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  signOut.mockResolvedValue({ error: null });
  const user = userEvent.setup();
  render(<SignOutButton />);

  await user.click(await screen.findByRole("button", { name: "Sign out" }));

  expect(signOut).toHaveBeenCalled();
  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/sign-in");
  });
  expect(refresh).toHaveBeenCalled();
});

test("a failed signOut clears the loading state and shows a real error instead of getting stuck", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  signOut.mockResolvedValue({ error: { message: "Network error" } });
  const user = userEvent.setup();
  render(<SignOutButton />);

  const button = await screen.findByRole("button", { name: "Sign out" });
  await user.click(button);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Network error");
  // Loading state cleared (the bug being fixed: it used to stay stuck on
  // "Signing out…" forever whenever the button didn't get unmounted by a
  // real navigation) and the control is clickable again.
  expect(screen.getByRole("button", { name: "Sign out" }).hasAttribute("disabled")).toBe(false);
  expect(push).not.toHaveBeenCalled();
});

test("becoming signed out live (via onAuthStateChange) hides the control", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  render(<SignOutButton />);
  await screen.findByRole("button", { name: "Sign out" });

  const onChange = onAuthStateChange.mock.calls[0]?.[0] as (event: string, session: null) => void;
  onChange("SIGNED_OUT", null);

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});

test("empties the household-data caches before redirecting to /sign-in", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  signOut.mockResolvedValue({ error: null });
  const order: string[] = [];
  let finishClearing: () => void = () => undefined;
  clearPrivateCaches.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        order.push("clear");
        finishClearing = resolve;
      }),
  );
  push.mockImplementation(() => order.push("push"));
  const user = userEvent.setup();
  render(<SignOutButton />);

  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => {
    expect(clearPrivateCaches).toHaveBeenCalled();
  });
  // Still clearing: no redirect yet, so nothing can navigate (and prefetch)
  // under the old caches' noses.
  expect(push).not.toHaveBeenCalled();

  finishClearing();
  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/sign-in");
  });
  expect(order).toEqual(["clear", "push"]);
});

test("a failed signOut leaves the caches alone (the session is still there)", async () => {
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  signOut.mockResolvedValue({ error: { message: "Network error" } });
  const user = userEvent.setup();
  render(<SignOutButton />);

  await user.click(await screen.findByRole("button", { name: "Sign out" }));
  await screen.findByRole("alert");

  expect(clearPrivateCaches).not.toHaveBeenCalled();
});
