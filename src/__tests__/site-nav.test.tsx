import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// SiteNav now renders SignOutButton, which imports the real Supabase
// client factory (src/server/db/client.ts) — that in turn parses env vars
// via a zod schema at import time (src/lib/env.ts), which isn't guaranteed
// to have real values in a bare `vitest run` outside of CI's placeholder
// env block. Mocked here so this stays a true unit test of SiteNav's own
// composition, not an incidental test of env validation.
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

// Static import is safe here: vi.mock calls are hoisted above imports, so
// next/navigation and @/server/db/client are already mocked by the time
// site-nav.tsx evaluates them.
import { SiteNav } from "@/components/site-nav";

test("marks the Stuff tab active on /", () => {
  usePathname.mockReturnValue("/");
  render(<SiteNav />);
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBeNull();
});

test("has a visible Invite partner link to /settings/invite, distinct from the two BottomNav tabs", () => {
  usePathname.mockReturnValue("/");
  render(<SiteNav />);
  const inviteLink = screen.getByRole("link", { name: "Invite partner" });
  expect(inviteLink.getAttribute("href")).toBe("/settings/invite");
  // Still exactly two BottomNav tabs — this is a separate nav link, not a
  // third tab (nav-tabs.ts's own settled 2-tab decision is unchanged).
  expect(screen.getByRole("navigation", { name: "Primary" }).querySelectorAll("a")).toHaveLength(2);
});

test("marks the Activity tab active on /activity", () => {
  usePathname.mockReturnValue("/activity");
  render(<SiteNav />);
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBeNull();
});

test("renders nothing on /sign-up — the Stuff/Activity tabs don't belong on a standalone auth page", () => {
  usePathname.mockReturnValue("/sign-up");
  const { container } = render(<SiteNav />);
  expect(container.firstChild).toBeNull();
});

test("renders nothing on /sign-in", () => {
  usePathname.mockReturnValue("/sign-in");
  const { container } = render(<SiteNav />);
  expect(container.firstChild).toBeNull();
});

test("renders nothing on /forgot-password", () => {
  usePathname.mockReturnValue("/forgot-password");
  const { container } = render(<SiteNav />);
  expect(container.firstChild).toBeNull();
});

test("renders nothing on /reset-password", () => {
  usePathname.mockReturnValue("/reset-password");
  const { container } = render(<SiteNav />);
  expect(container.firstChild).toBeNull();
});
