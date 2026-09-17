import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signInWithPassword, rpc, maybeSingle } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    auth: { signInWithPassword },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

// Static import is safe here for the same reason as site-nav.test.tsx: the
// vi.mock calls above are hoisted above imports.
import { SignInForm } from "@/components/sign-in-form";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  // Household bootstrap succeeds by default — tests below that care about
  // its failure path override this per-test.
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
});

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signInWithPassword.mockReset();
  rpc.mockReset();
  maybeSingle.mockReset();
  fetchMock.mockReset();
});

test("has an entry point into the forgot-password flow", () => {
  render(<SignInForm />);
  const link = screen.getByRole("link", { name: "Forgot your password?" });
  expect(link.getAttribute("href")).toBe("/forgot-password");
});

test("submitting with empty fields shows inline errors and never calls signInWithPassword", async () => {
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(screen.getByText("Enter your email address.")).toBeDefined();
  expect(screen.getByText("Enter your password.")).toBeDefined();
  expect(signInWithPassword).not.toHaveBeenCalled();
});

test("submitting an invalid email shows an inline error and never calls signInWithPassword", async () => {
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText("Email"), "not-an-email");
  await user.type(screen.getByLabelText("Password"), "whatever");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(screen.getByText("Enter a valid email address.")).toBeDefined();
  expect(signInWithPassword).not.toHaveBeenCalled();
});

test("wrong credentials surface Supabase's own error message verbatim, not a generic one", async () => {
  signInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: { message: "Invalid login credentials" },
  });
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Invalid login credentials");
  expect(push).not.toHaveBeenCalled();
});

test("valid credentials bootstrap a household, then redirect to /", async () => {
  signInWithPassword.mockResolvedValue({
    data: { user: { id: "1" }, session: { access_token: "t" } },
    error: null,
  });
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/");
  });
  expect(refresh).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith("/api/household/bootstrap", { method: "POST" });
});

test("a household-bootstrap failure shows a dismissible notice, logs it, and never blocks reaching /", async () => {
  signInWithPassword.mockResolvedValue({
    data: { user: { id: "1" }, session: { access_token: "t" } },
    error: null,
  });
  fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ ok: false }) });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/couldn.t finish setting up your household/i);
  expect(consoleError).toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(push).toHaveBeenCalledWith("/");
  expect(refresh).toHaveBeenCalled();

  consoleError.mockRestore();
});

test("submit shows a real loading state while signInWithPassword is in flight", async () => {
  let resolveSignIn: (value: { data: { user: null; session: null }; error: null }) => void = () => {
    throw new Error("resolveSignIn called before assignment");
  };
  signInWithPassword.mockReturnValue(
    new Promise((resolve) => {
      resolveSignIn = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<SignInForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  const button = await screen.findByRole("button", { name: "Signing in…" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.hasAttribute("disabled")).toBe(true);

  resolveSignIn({ data: { user: null, session: null }, error: null });
  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/");
  });
});

test("with an invite code, a successful sign-in redeems it before bootstrapping, and never navigates itself", async () => {
  signInWithPassword.mockResolvedValue({
    data: { user: { id: "1" }, session: { access_token: "t" } },
    error: null,
  });
  rpc.mockResolvedValue({ data: { household_id: "household-1" }, error: null });
  maybeSingle.mockResolvedValue({ data: { name: "Maayan's home" } });
  const onRedeemed = vi.fn();

  const user = userEvent.setup();
  render(<SignInForm invite={{ code: "abc123", onRedeemed }} />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => {
    expect(onRedeemed).toHaveBeenCalledWith({ ok: true, householdName: "Maayan's home" });
  });
  expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "abc123" });
  expect(fetchMock).toHaveBeenCalledWith("/api/household/bootstrap", { method: "POST" });
  expect(push).not.toHaveBeenCalled();
});

test("with an invite code, a rejected redemption still bootstraps as a fallback and reports the error up", async () => {
  signInWithPassword.mockResolvedValue({
    data: { user: { id: "1" }, session: { access_token: "t" } },
    error: null,
  });
  rpc.mockResolvedValue({ data: null, error: { message: "redeem_invite: invite not found" } });
  maybeSingle.mockResolvedValue({ data: null });
  const onRedeemed = vi.fn();

  const user = userEvent.setup();
  render(<SignInForm invite={{ code: "bogus-code", onRedeemed }} />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() => {
    expect(onRedeemed).toHaveBeenCalledWith({ ok: false, error: "redeem_invite: invite not found" });
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/household/bootstrap", { method: "POST" });
});

test("with an invite code, the 'don't have an account' footer link is suppressed", () => {
  render(<SignInForm invite={{ code: "abc123", onRedeemed: vi.fn() }} />);
  expect(screen.queryByRole("link", { name: "Sign up" })).toBeNull();
});
