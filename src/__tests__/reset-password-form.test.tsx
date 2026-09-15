import { afterEach, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { onAuthStateChange, updateUser } = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({ createClient: () => ({ auth: { onAuthStateChange, updateUser } }) }));

// Static import is safe here for the same reason as sign-in-form.test.tsx:
// the vi.mock call above is hoisted above imports.
import { ResetPasswordForm } from "@/components/reset-password-form";

function mockRecoverySession() {
  onAuthStateChange.mockImplementation((callback: (event: string) => void) => {
    callback("PASSWORD_RECOVERY");
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
}

function mockNoRecoverySession() {
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
}

afterEach(() => {
  onAuthStateChange.mockReset();
  updateUser.mockReset();
  vi.useRealTimers();
});

test("a real recovery session (PASSWORD_RECOVERY fires) shows the new-password form", () => {
  mockRecoverySession();
  render(<ResetPasswordForm />);

  expect(screen.getByLabelText("New password")).toBeDefined();
  expect(screen.getByLabelText("Confirm new password")).toBeDefined();
});

test("no recovery session (direct navigation) shows the invalid-link state, not the form, once the check times out", async () => {
  mockNoRecoverySession();
  vi.useFakeTimers();
  render(<ResetPasswordForm />);

  expect(screen.getByText("Checking your reset link…")).toBeDefined();
  expect(screen.queryByLabelText("New password")).toBeNull();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });

  expect(screen.getByText("This reset link is invalid or has expired")).toBeDefined();
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href")).toBe("/forgot-password");
});

test("submitting empty or mismatched passwords shows specific inline errors and never calls updateUser", async () => {
  mockRecoverySession();
  const user = userEvent.setup();
  render(<ResetPasswordForm />);

  await user.click(screen.getByRole("button", { name: "Update password" }));
  expect(screen.getByText("Enter a password.")).toBeDefined();
  expect(screen.getByText("Confirm your new password.")).toBeDefined();
  expect(updateUser).not.toHaveBeenCalled();

  await user.type(screen.getByLabelText("New password"), "longenough1");
  await user.type(screen.getByLabelText("Confirm new password"), "different1");
  await user.click(screen.getByRole("button", { name: "Update password" }));

  expect(screen.getByText("Passwords don't match.")).toBeDefined();
  expect(updateUser).not.toHaveBeenCalled();
});

test("a valid new password updates and shows a success state with a link to sign in", async () => {
  mockRecoverySession();
  updateUser.mockResolvedValue({ data: {}, error: null });
  const user = userEvent.setup();
  render(<ResetPasswordForm />);

  await user.type(screen.getByLabelText("New password"), "longenough1");
  await user.type(screen.getByLabelText("Confirm new password"), "longenough1");
  await user.click(screen.getByRole("button", { name: "Update password" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toContain("Your password has been changed.");
  expect(updateUser).toHaveBeenCalledWith({ password: "longenough1" });
  expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe("/sign-in");
});

test("an updateUser error surfaces Supabase's own message and stays on the form", async () => {
  mockRecoverySession();
  updateUser.mockResolvedValue({ data: null, error: { message: "Auth session missing." } });
  const user = userEvent.setup();
  render(<ResetPasswordForm />);

  await user.type(screen.getByLabelText("New password"), "longenough1");
  await user.type(screen.getByLabelText("Confirm new password"), "longenough1");
  await user.click(screen.getByRole("button", { name: "Update password" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Auth session missing.");
  expect(screen.queryByRole("status")).toBeNull();
});

test("updateUser throwing (not resolving to { error }) surfaces an error too, not a stuck loading state", async () => {
  // @supabase/auth-js re-throws for anything it doesn't recognize as a
  // structured AuthError (e.g. a raw network failure) rather than
  // resolving to { error } — this proves that path doesn't leave the
  // button stuck on "Updating…" forever.
  mockRecoverySession();
  updateUser.mockRejectedValue(new TypeError("Failed to fetch"));
  const user = userEvent.setup();
  render(<ResetPasswordForm />);

  await user.type(screen.getByLabelText("New password"), "longenough1");
  await user.type(screen.getByLabelText("Confirm new password"), "longenough1");
  await user.click(screen.getByRole("button", { name: "Update password" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Something went wrong. Please try again.");
  expect(screen.queryByRole("button", { name: "Updating…" })).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});
