import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/server/db/client", () => ({ createClient: () => ({ auth: { signOut } }) }));

// Static import is safe here for the same reason as site-nav.test.tsx: the
// vi.mock calls above are hoisted above imports.
import { SignOutButton } from "@/components/sign-out-button";

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  signOut.mockReset();
});

test("clicking sign out calls supabase.auth.signOut and redirects to /sign-in", async () => {
  signOut.mockResolvedValue({ error: null });
  const user = userEvent.setup();
  render(<SignOutButton />);

  await user.click(screen.getByRole("button", { name: "Sign out" }));

  expect(signOut).toHaveBeenCalled();
  await waitFor(() => {
    expect(push).toHaveBeenCalledWith("/sign-in");
  });
  expect(refresh).toHaveBeenCalled();
});
