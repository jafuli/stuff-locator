"use client";

import { usePathname } from "next/navigation";
import { HouseholdMenu } from "@/components/household-menu";
import { TabCapsule } from "@/components/tab-capsule";
import { NAV_TABS } from "@/lib/nav-tabs";

/**
 * Rendered only by src/app/(app)/layout.tsx: whether a page has the nav is
 * decided by which route group it lives in, not by checking the pathname
 * here (ADR 0013).
 *
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
 * cover the last row. Rendered by (app)/layout.tsx right after the page, so
 * it only exists where the nav does.
 */
export function NavClearance() {
  return <div aria-hidden="true" className="h-nav-clearance" />;
}
