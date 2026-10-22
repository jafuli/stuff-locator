import Link from "next/link";
import { cn } from "@/lib/cn";
import { BoxIcon, ClockIcon } from "@/components/icons";

export type NavTabIcon = "box" | "clock";

export interface NavTab {
  href: string;
  label: string;
  icon: NavTabIcon;
}

export interface TabCapsuleProps {
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

const ICONS: Record<NavTabIcon, () => React.JSX.Element> = {
  box: () => <BoxIcon />,
  clock: () => <ClockIcon />,
};

/**
 * The design system's TabCapsule: a floating surface capsule holding two
 * tabs, Stuff and Activity. It's a <nav> of links with aria-current — not a
 * tablist, because these navigate between pages rather than switch panels.
 * Active state is the ink fill, paper text and weight 500; inactive tabs are
 * muted at 400, so state never depends on colour alone.
 *
 * Positioning is the caller's job (see site-nav.tsx): this is just the
 * capsule, so it can be shown in /~components without being fixed to the
 * viewport.
 */
export function TabCapsule({ tabs, activePath }: TabCapsuleProps) {
  return (
    <nav aria-label="Primary" className="rounded-capsule border border-hairline bg-surface p-1 shadow-float">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const active = isTabActive(tab.href, activePath);
          const Icon = ICONS[tab.icon];
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-control px-4 text-nav outline-none",
                "transition-colors duration-150 ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                active ? "bg-ink text-paper" : "text-muted [font-weight:400]",
              )}
            >
              <Icon />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
