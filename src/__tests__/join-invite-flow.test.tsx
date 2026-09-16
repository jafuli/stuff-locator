import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signUp, signInWithPassword, rpc, maybeSingle } = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    auth: { signUp, signInWithPassword },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

// Static import is safe here for the same reason as sign-up-form.test.tsx:
// the vi.mock calls above are hoisted above imports.
import { JoinInviteFlow } from "@/components/join-invite-flow";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
});

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signUp.mockReset();
  signInWithPassword.mockReset();
  rpc.mockReset();
  maybeSingle.mockReset();
  fetchMock.mockReset();
});

test("an already-signed-in visitor redeems automatically and shows the real success state", async () => {
  rpc.mockResolvedValue({ data: { household_id: "household-1" }, error: null });
  maybeSingle.mockResolvedValue({ data: { name: "Maayan's home" } });

  render(<JoinInviteFlow code="abc123" initiallySignedIn />);

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Maayan's home");
  expect(screen.getByRole("link", { name: "Go to Stuff Locator" }).getAttribute("href")).toBe("/");
  expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "abc123" });
});

test("an already-signed-in visitor with an invalid code sees a specific error state", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "redeem_invite: invite not found" } });
  maybeSingle.mockResolvedValue({ data: null });

  render(<JoinInviteFlow code="bogus-code" initiallySignedIn />);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("redeem_invite: invite not found");
  expect(screen.getByRole("link", { name: "Back to Stuff Locator" }).getAttribute("href")).toBe("/");
});

test("a signed-out visitor sees the sign-up form by default; a successful sign-up redeems and shows success", async () => {
  signUp.mockResolvedValue({ data: { user: { id: "1" }, session: { access_token: "t" } }, error: null });
  rpc.mockResolvedValue({ data: { household_id: "household-1" }, error: null });
  maybeSingle.mockResolvedValue({ data: { name: "Maayan's home" } });

  const user = userEvent.setup();
  render(<JoinInviteFlow code="abc123" initiallySignedIn={false} />);

  expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Maayan's home");
});

test("toggling to sign-in switches forms locally, without navigating", async () => {
  const user = userEvent.setup();
  render(<JoinInviteFlow code="abc123" initiallySignedIn={false} />);

  expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();

  await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));

  expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  expect(push).not.toHaveBeenCalled();
});

test("a signed-out sign-in path also redeems the invite and shows success", async () => {
  signInWithPassword.mockResolvedValue({ data: { user: { id: "1" }, session: { access_token: "t" } }, error: null });
  rpc.mockResolvedValue({ data: { household_id: "household-1" }, error: null });
  maybeSingle.mockResolvedValue({ data: { name: "Maayan's home" } });

  const user = userEvent.setup();
  render(<JoinInviteFlow code="abc123" initiallySignedIn={false} />);

  await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));
  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toContain("Maayan's home");
  });
});
