"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { NAV_TABS } from "@/lib/nav-tabs";

/**
 * Standalone auth pages — not "the main app" in the sense this nav means.
 * Not a route-group restructure (see git history/PR discussion): the app's
 * one genuine not-found.tsx can only ever be scoped to the true root
 * layout, so moving SiteNav into a nested group layout would also silently
 * strip the nav off the existing 404 page — a bigger, riskier change than
 * "don't show tabs on two auth pages" asked for.
 */
const ROUTES_WITHOUT_NAV = ["/sign-up", "/sign-in", "/forgot-password", "/reset-password"];

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
 * 2-tab contract stays untouched. It's already self-contained about
 * whether to show anything (renders null with no active session — see its
 * own doc comment), but that alone doesn't cover /sign-up/ /sign-in
 * themselves for an already-signed-in visitor who navigates back to them
 * manually — ROUTES_WITHOUT_NAV hides the whole nav there unconditionally,
 * regardless of session state, since those pages are meant to be
 * standalone either way.
 *
 * The "Invite partner" link (the Invite-partner-UI task's entry point,
 * AC #3) is a plain nav link in its own row, not a third BottomNav tab —
 * the 2-tab count is a settled, documented decision (see nav-tabs.ts's own
 * comment: the wireframe's 3rd "Home" tab was deliberately dropped), and
 * reopening it wasn't what this task asked for. Always rendered (unlike
 * SignOutButton) since it's ordinary navigation to a page that gates on
 * its own session check, the same way BottomNav's own tabs don't hide
 * themselves based on auth state either.
 */
export function SiteNav() {
  const pathname = usePathname();
  if (ROUTES_WITHOUT_NAV.includes(pathname)) {
    return null;
  }
  return (
    <>
      <BottomNav tabs={NAV_TABS} activePath={pathname} />
      <div className="flex justify-center border-t border-line bg-wash py-1.5">
        <Link
          href="/settings/invite"
          className="px-2 py-1 text-[10px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Invite partner
        </Link>
      </div>
      <SignOutButton />
    </>
  );
}
