import Link from "next/link";
import { cn } from "@/lib/cn";

export interface NavTab {
  href: string;
  label: string;
}

export interface BottomNavProps {
  tabs: readonly NavTab[];
  /** The current path, supplied by the caller — deliberately not read via usePathname(),
   * so this stays a plain, server-renderable, easily-testable component. */
  activePath: string;
}

/**
 * Whether `tabHref` should read as active for `activePath` — an exact match,
 * or `activePath` nested under `tabHref` (e.g. "/stuff/42" under "/stuff").
 * Guards against "/stuff" false-matching a sibling like "/stuffing".
 */
export function isTabActive(tabHref: string, activePath: string): boolean {
  if (activePath === tabHref) {
    return true;
  }
  return tabHref !== "/" && activePath.startsWith(`${tabHref}/`);
}

/**
 * Two-tab bottom navigation. The wireframes draw three tabs (Stuff /
 * Activity / Home) and their own footer flags the count as an open
 * question; this task's Acceptance Criteria resolves it to two, dropping
 * the "Home" (household settings) tab — see the PR description. The
 * component itself stays generic over tab count for reuse/testability; the
 * 2-tab decision lives in the fixture data that calls it.
 */
export function BottomNav({ tabs, activePath }: BottomNavProps) {
  return (
    <nav aria-label="Primary" className="flex border-t border-line bg-wash">
      {tabs.map((tab) => {
        const active = isTabActive(tab.href, activePath);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 py-[9px] text-center text-[10px] outline-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
              active ? "[font-weight:680] text-ink shadow-[inset_0_2px_0_var(--color-ink)]" : "text-mid",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
