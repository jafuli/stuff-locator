import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));
vi.mock("@/server/db/client", () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));

// Static import is safe here for the same reason as site-nav.test.tsx: the
// vi.mock calls above are hoisted above imports.
import { SignInForm } from "@/components/sign-in-form";

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signInWithPassword.mockReset();
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

test("valid credentials redirect to /", async () => {
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
