"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { NAV_TABS } from "@/lib/nav-tabs";

/**
 * The one place that reads the router. BottomNav itself is deliberately
 * prop-driven (see its own doc comment) so it stays a plain,
 * server-renderable, easily-testable component — Next.js doesn't support
 * reading the current URL from a Server Component, so something has to be a
 * Client Component to supply `activePath`. This is that something; it's a
 * pass-through and carries no logic of its own worth testing beyond what
 * BottomNav's own tests already cover, so it's exercised indirectly via
 * src/__tests__/site-nav.test.tsx (mocking next/navigation) rather than a
 * dedicated in-browser check.
 *
 * SignOutButton is rendered here (not inside BottomNav) so BottomNav's own
 * 2-tab contract stays untouched. It's self-contained about whether to show
 * anything at all (renders null with no active session — see its own doc
 * comment), so this stays a plain, unconditional render regardless of
 * auth state, including on /sign-up and /sign-in themselves.
 */
export function SiteNav() {
  const pathname = usePathname();
  return (
    <>
      <BottomNav tabs={NAV_TABS} activePath={pathname} />
      <SignOutButton />
    </>
  );
}
