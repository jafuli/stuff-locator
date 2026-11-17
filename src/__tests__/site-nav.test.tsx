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
import { NavClearance, SiteNav } from "@/components/site-nav";
import { STUFF_PATH } from "@/lib/routes";

test("marks the Stuff tab active on the Stuff screen", () => {
  usePathname.mockReturnValue(STUFF_PATH);
  render(<SiteNav />);
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBeNull();
});

test("has exactly two capsule tabs, and no loose Invite link or Sign out button under them any more", () => {
  usePathname.mockReturnValue(STUFF_PATH);
  render(<SiteNav />);
  // Invite partner / Settings / Sign out moved into the household sheet (see
  // household-menu.test.tsx) — the primary nav is just the two tabs.
  expect(screen.getByRole("navigation", { name: "Primary" }).querySelectorAll("a")).toHaveLength(2);
  expect(screen.queryByRole("link", { name: "Invite partner" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("marks the Activity tab active on /activity", () => {
  usePathname.mockReturnValue("/activity");
  render(<SiteNav />);
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBeNull();
});

test("NavClearance reserves room for the floating nav", () => {
  const { container } = render(<NavClearance />);
  expect(container.firstChild).not.toBeNull();
});
