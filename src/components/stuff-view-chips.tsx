import Link from "next/link";
import { cn } from "@/lib/cn";

export type StuffView = "all" | "place";

export interface StuffViewChipsProps {
  /** The household's total item count — not the number of search results. */
  total: number;
  /** Which view the current page is. */
  active: StuffView;
}

// Chips press down 1px on tap (brand book); the transform is dropped under
// prefers-reduced-motion by the global switch in globals.css.
const CHIP_BASE =
  "inline-flex min-h-target-min items-center justify-center rounded-full border px-4 text-nav outline-none " +
  "transition-[transform,background-color] duration-150 ease-out active:translate-y-px " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const CHIP_ACTIVE = "border-ink bg-ink text-paper";
// A chip's only edge is its border, so it's border-strong, not border-control.
const CHIP_INACTIVE = "border-border-strong bg-surface text-muted [font-weight:400]";

/**
 * The "All (n)" / "By place" toggle under the Stuff search (wireframes 02 and
 * C1). Two real links, not buttons: each is a different route, so they work
 * without scripting and the current one is marked with `aria-current` rather
 * than a state only sighted users can see.
 *
 * Shared by `/` and the top level of `/browse`, so the two read as one view
 * with a toggle. "Recent" from the v1 wireframes is deliberately not here.
 */
export function StuffViewChips({ total, active }: StuffViewChipsProps) {
  return (
    <nav aria-label="Stuff view" className="flex flex-wrap gap-2">
      <Link
        href="/"
        aria-current={active === "all" ? "page" : undefined}
        className={cn(CHIP_BASE, active === "all" ? CHIP_ACTIVE : CHIP_INACTIVE)}
      >
        All ({total})
      </Link>
      <Link
        href="/browse"
        aria-current={active === "place" ? "page" : undefined}
        className={cn(CHIP_BASE, active === "place" ? CHIP_ACTIVE : CHIP_INACTIVE)}
      >
        By place
      </Link>
    </nav>
  );
}
