import { expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvitePanel } from "@/components/invite-panel";

// userEvent.setup() installs its own Clipboard stub on navigator.clipboard
// (for its .copy()/.paste() support) — confirmed empirically that it runs
// AFTER and overwrites whatever's already there, so the mock has to be
// applied AFTER setup(), not before, or this component's real calls hit
// user-event's stub instead of this test's assertions.
function setupUserWithMockedClipboard(): { user: ReturnType<typeof userEvent.setup>; writeText: ReturnType<typeof vi.fn> } {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return { user, writeText };
}

test("shows the real code and a /join/[code] link built from the page's own origin", async () => {
  render(<InvitePanel code="abc123" />);

  expect(screen.getByText("abc123")).toBeDefined();
  // jsdom's default test origin is http://localhost:3000.
  await waitFor(() => {
    expect(screen.getByText("http://localhost:3000/join/abc123")).toBeDefined();
  });
});

test("copying the link calls the Clipboard API with the exact link and shows a visible confirmation", async () => {
  const { user, writeText } = setupUserWithMockedClipboard();
  render(<InvitePanel code="abc123" />);

  await waitFor(() => {
    expect(screen.getByText("http://localhost:3000/join/abc123")).toBeDefined();
  });

  await user.click(screen.getByRole("button", { name: "Copy link" }));

  expect(writeText).toHaveBeenCalledWith("http://localhost:3000/join/abc123");
  expect(await screen.findByText("Copied!")).toBeDefined();
});

test("a failed copy shows a visible error instead of a silent failure", async () => {
  const { user, writeText } = setupUserWithMockedClipboard();
  writeText.mockRejectedValueOnce(new Error("denied"));
  render(<InvitePanel code="abc123" />);

  await user.click(screen.getByRole("button", { name: "Copy link" }));

  const error = await screen.findByText("Couldn't copy automatically — copy the link above manually.");
  expect(error.getAttribute("role")).toBe("alert");
  expect(screen.queryByText("Copied!")).toBeNull();
});
