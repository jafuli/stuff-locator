import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signUp, rpc, maybeSingle } = vi.hoisted(() => ({ signUp: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    auth: { signUp },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

// Static import is safe here for the same reason as site-nav.test.tsx: the
// vi.mock calls above are hoisted above imports.
import { SignUpForm } from "@/components/sign-up-form";

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
  signUp.mockReset();
  rpc.mockReset();
  maybeSingle.mockReset();
  fetchMock.mockReset();
});

test("submitting with empty fields shows inline errors and never calls signUp", async () => {
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.click(screen.getByRole("button", { name: "Create account" }));

  expect(screen.getByText("Enter your email address.")).toBeDefined();
  expect(screen.getByText("Enter a password.")).toBeDefined();
  expect(signUp).not.toHaveBeenCalled();
});

test("submitting an invalid email shows an inline error and never calls signUp", async () => {
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText("Email"), "not-an-email");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  expect(screen.getByText("Enter a valid email address.")).toBeDefined();
  expect(signUp).not.toHaveBeenCalled();
});

test("a rejected signUp surfaces Supabase's own error message verbatim", async () => {
  signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "User already registered" } });
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("User already registered");
  expect(push).not.toHaveBeenCalled();
});

test("a successful signUp with a returned session bootstraps a household, then redirects to /", async () => {
  signUp.mockResolvedValue({ data: { user: { id: "1" }, session: { access_token: "t" } }, error: null });
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/");
  });
  expect(refresh).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith("/api/household/bootstrap", { method: "POST" });
});

test("a household-bootstrap failure shows a dismissible notice, logs it, and never blocks reaching /", async () => {
  signUp.mockResolvedValue({ data: { user: { id: "1" }, session: { access_token: "t" } }, error: null });
  fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ ok: false }) });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toMatch(/couldn.t finish setting up your household/i);
  expect(consoleError).toHaveBeenCalled();
  // Doesn't navigate the instant the notice appears — the auto-continue
  // timer (exercised for real in e2e) hasn't fired yet.
  expect(push).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(push).toHaveBeenCalledWith("/");
  expect(refresh).toHaveBeenCalled();

  consoleError.mockRestore();
});

test("a successful signUp with no session shows the check-your-email state instead of redirecting", async () => {
  signUp.mockResolvedValue({ data: { user: { id: "1" }, session: null }, error: null });
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Check your email to confirm your account");
  expect(push).not.toHaveBeenCalled();
});

test("submit shows a real loading state while signUp is in flight", async () => {
  let resolveSignUp: (value: { data: { user: null; session: null }; error: null }) => void = () => {
    throw new Error("resolveSignUp called before assignment");
  };
  signUp.mockReturnValue(
    new Promise((resolve) => {
      resolveSignUp = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  const button = await screen.findByRole("button", { name: "Creating account…" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.hasAttribute("disabled")).toBe(true);

  resolveSignUp({ data: { user: null, session: null }, error: null });
  await waitFor(() => {
    expect(screen.getByRole("status")).toBeDefined();
  });
});

test("with an invite code, a successful sign-up redeems it before bootstrapping, and never navigates itself", async () => {
  signUp.mockResolvedValue({ data: { user: { id: "1" }, session: { access_token: "t" } }, error: null });
  rpc.mockResolvedValue({ data: { household_id: "household-1" }, error: null });
  maybeSingle.mockResolvedValue({ data: { name: "Maayan's home" } });
  const onRedeemed = vi.fn();

  const user = userEvent.setup();
  render(<SignUpForm invite={{ code: "abc123", onRedeemed }} />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => {
    expect(onRedeemed).toHaveBeenCalledWith({ ok: true, householdName: "Maayan's home" });
  });
  expect(rpc).toHaveBeenCalledWith("redeem_invite", { p_code: "abc123" });
  // Bootstrap still runs (safe no-op — see the component's own comment),
  // but this form never navigates itself for the invite path; the caller
  // (JoinInviteFlow) owns what happens after onRedeemed.
  expect(fetchMock).toHaveBeenCalledWith("/api/household/bootstrap", { method: "POST" });
  expect(push).not.toHaveBeenCalled();
});

test("with an invite code, a rejected redemption still bootstraps as a fallback and reports the error up", async () => {
  signUp.mockResolvedValue({ data: { user: { id: "1" }, session: { access_token: "t" } }, error: null });
  rpc.mockResolvedValue({ data: null, error: { message: "redeem_invite: invite expired" } });
  maybeSingle.mockResolvedValue({ data: null });
  const onRedeemed = vi.fn();

  const user = userEvent.setup();
  render(<SignUpForm invite={{ code: "expired-code", onRedeemed }} />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "a-real-password");
  await user.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() => {
    expect(onRedeemed).toHaveBeenCalledWith({ ok: false, error: "redeem_invite: invite expired" });
  });
  // Not left stranded with zero households despite the bad code.
  expect(fetchMock).toHaveBeenCalledWith("/api/household/bootstrap", { method: "POST" });
});

test("with an invite code, the 'already have an account' footer link is suppressed", () => {
  render(<SignUpForm invite={{ code: "abc123", onRedeemed: vi.fn() }} />);
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
});
