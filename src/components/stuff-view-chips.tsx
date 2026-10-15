import Link from "next/link";
import { cn } from "@/lib/cn";

export type StuffView = "all" | "place";

export interface StuffViewChipsProps {
  /** The household's total item count — not the number of search results. */
  total: number;
  /** Which view the current page is. */
  active: StuffView;
}

const CHIP_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-full border-[1.5px] px-[14px] py-[6px] text-[12px] font-semibold outline-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

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
        className={cn(CHIP_BASE, active === "all" ? "border-ink bg-ink text-white" : "border-line text-mid")}
      >
        All ({total})
      </Link>
      <Link
        href="/browse"
        aria-current={active === "place" ? "page" : undefined}
        className={cn(CHIP_BASE, active === "place" ? "border-ink bg-ink text-white" : "border-line text-mid")}
      >
        By place
      </Link>
    </nav>
  );
}
