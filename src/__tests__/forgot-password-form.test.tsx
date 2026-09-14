import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { resetPasswordForEmail } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn<
    (email: string, options: { redirectTo: string }) => Promise<{ data: object | null; error: { message: string } | null }>
  >(),
}));
vi.mock("@/server/db/client", () => ({ createClient: () => ({ auth: { resetPasswordForEmail } }) }));

// Static import is safe here for the same reason as sign-in-form.test.tsx:
// the vi.mock call above is hoisted above imports.
import { ForgotPasswordForm } from "@/components/forgot-password-form";

afterEach(() => {
  resetPasswordForEmail.mockReset();
});

test("submitting an empty email shows an inline error and never calls resetPasswordForEmail", async () => {
  const user = userEvent.setup();
  render(<ForgotPasswordForm />);

  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  expect(screen.getByText("Enter your email address.")).toBeDefined();
  expect(resetPasswordForEmail).not.toHaveBeenCalled();
});

test("a valid-looking email shows the generic confirmation", async () => {
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  const user = userEvent.setup();
  render(<ForgotPasswordForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toMatch(/if an account exists for that email/i);
  expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  const [calledEmail, calledOptions] = resetPasswordForEmail.mock.calls[0];
  expect(calledEmail).toBe("person@example.com");
  expect(calledOptions.redirectTo).toContain("/reset-password");
});

test("even an error from resetPasswordForEmail still shows the same generic confirmation, never a distinguishing message", async () => {
  resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: "some transient failure" } });
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const user = userEvent.setup();
  render(<ForgotPasswordForm />);

  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.click(screen.getByRole("button", { name: "Send reset link" }));

  const status = await screen.findByRole("status");
  expect(status.textContent).toMatch(/if an account exists for that email/i);
  expect(screen.queryByText("some transient failure")).toBeNull();
  expect(consoleError).toHaveBeenCalled();

  consoleError.mockRestore();
});
