import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("@/server/db/client", () => ({ createClient: () => ({ auth: { signUp } }) }));

// Static import is safe here for the same reason as site-nav.test.tsx: the
// vi.mock calls above are hoisted above imports.
import { SignUpForm } from "@/components/sign-up-form";

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signUp.mockReset();
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

test("a successful signUp with a returned session redirects to /", async () => {
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
