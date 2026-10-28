"use client";

import { usePathname } from "next/navigation";
import { HouseholdMenu } from "@/components/household-menu";
import { TabCapsule } from "@/components/tab-capsule";
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
 * The one place that reads the router. TabCapsule itself is deliberately
 * prop-driven (see its own doc comment) so it stays a plain,
 * server-renderable, easily-testable component — Next.js doesn't support
 * reading the current URL from a Server Component, so something has to be a
 * Client Component to supply `activePath`. This is that something.
 *
 * The capsule floats: fixed to the bottom of the viewport, space-6 above the
 * edge plus the device's safe area, with the household button (and its sheet
 * for Invite partner / Settings / Sign out) right-aligned above it. The
 * wrapper ignores pointer events so the gutters beside the capsule stay
 * tappable page content; only the capsule and the button take them.
 */
export function SiteNav() {
  const pathname = usePathname();
  if (ROUTES_WITHOUT_NAV.includes(pathname)) {
    return null;
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(var(--spacing-space-6)+env(safe-area-inset-bottom))] min-[375px]:px-5">
      <div className="mx-auto flex w-full max-w-sm flex-col items-end gap-3">
        <div className="pointer-events-auto">
          <HouseholdMenu />
        </div>
        <div className="pointer-events-auto w-full">
          <TabCapsule tabs={NAV_TABS} activePath={pathname} />
        </div>
      </div>
    </div>
  );
}

/**
 * Blank space at the end of the scrolling page content, as tall as the
 * floating nav, so the capsule (and the household button above it) can never
 * cover the last row. Rendered only where the nav is, so standalone auth
 * pages don't grow a phantom scroll area.
 */
export function NavClearance() {
  const pathname = usePathname();
  if (ROUTES_WITHOUT_NAV.includes(pathname)) {
    return null;
  }
  return <div aria-hidden="true" className="h-nav-clearance" />;
}
