import Link from "next/link";
import { cn } from "@/lib/cn";
import { BoxIcon, ClockIcon } from "@/components/icons";

export type NavTabIcon = "box" | "clock";

export interface NavTab {
  href: string;
  label: string;
  icon: NavTabIcon;
  /**
   * Other sections this tab stands for, highlighted as well as `href` and
   * everything under it, e.g. Stuff for /browse (Browse is Stuff, by place).
   */
  matches?: readonly string[];
}

export interface TabCapsuleProps {
  tabs: readonly NavTab[];
  /** The current path, supplied by the caller — deliberately not read via usePathname(),
   * so this stays a plain, server-renderable, easily-testable component. */
  activePath: string;
}

/**
 * Whether `activePath` is `base` or nested under it (e.g. "/browse/42" under
 * "/browse"). Guards against "/browse" false-matching a sibling like
 * "/browser".
 */
function isUnder(base: string, activePath: string): boolean {
  if (activePath === base) {
    return true;
  }
  return base !== "/" && activePath.startsWith(`${base}/`);
}

/**
 * Whether `tab` should read as active for `activePath`: its own `href`, or any
 * path it `matches`, each with the same exact-or-nested rule.
 */
export function isTabActive(tab: Pick<NavTab, "href" | "matches">, activePath: string): boolean {
  return [tab.href, ...(tab.matches ?? [])].some((base) => isUnder(base, activePath));
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
          const active = isTabActive(tab, activePath);
          const Icon = ICONS[tab.icon];
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-control px-4 text-nav",
                "transition-colors duration-150 ease-out",
                "focus-ring",
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
