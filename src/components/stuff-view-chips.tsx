"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { STUFF_PATH } from "@/lib/routes";

export type StuffView = "all" | "place";

export interface StuffViewChipsProps {
  /** Which view is selected. */
  active: StuffView | null;
  /**
   * Fires when a chip's navigation starts waiting on the server, and again
   * when it lands. Only when the route wasn't prefetched: Next skips the
   * pending phase for a prefetched one, whose loading.tsx shows at once.
   */
  onPendingChange?: (view: StuffView, pending: boolean) => void;
}

// Chips press down 1px on tap (brand book); the transform is dropped under
// prefers-reduced-motion by the global switch in globals.css.
const CHIP_BASE =
  "inline-flex min-h-target-min items-center justify-center rounded-full border px-4 text-nav " +
  "transition-[transform,background-color] duration-150 ease-out active:translate-y-px " +
  "focus-ring";
const CHIP_ACTIVE = "border-ink bg-ink text-paper";
// A chip's only edge is its border, so it's border-strong, not border-control.
const CHIP_INACTIVE = "border-border-strong bg-surface text-muted [font-weight:400]";

/** Reports its Link's pending state; renders nothing (useLinkStatus must sit inside the Link). */
function PendingReporter({ view, onChange }: { view: StuffView; onChange?: StuffViewChipsProps["onPendingChange"] }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    onChange?.(view, pending);
  }, [view, pending, onChange]);
  return null;
}

/**
 * The "All" / "By place" toggle under the Stuff search (wireframes 02 and
 * C1). The item count that used to sit in "All (n)" moved to a quiet line
 * above the list (CountLine), where it can also say how close the household
 * is to its limit (ADR 0015). Two real links, not buttons: each is a different route, so they work
 * without scripting and the current one is marked with `aria-current` rather
 * than a state only sighted users can see.
 *
 * Rendered once, by the persistent header both views share
 * (StuffViewsShell), so it never unmounts on a switch. "Recent" from the v1
 * wireframes is deliberately not here.
 */
export function StuffViewChips({ active, onPendingChange }: StuffViewChipsProps) {
  return (
    <nav aria-label="Stuff view" className="flex flex-wrap gap-2">
      <Link
        href={STUFF_PATH}
        aria-current={active === "all" ? "page" : undefined}
        className={cn(CHIP_BASE, active === "all" ? CHIP_ACTIVE : CHIP_INACTIVE)}
      >
        All
        <PendingReporter view="all" onChange={onPendingChange} />
      </Link>
      <Link
        href="/browse"
        aria-current={active === "place" ? "page" : undefined}
        className={cn(CHIP_BASE, active === "place" ? CHIP_ACTIVE : CHIP_INACTIVE)}
      >
        By place
        <PendingReporter view="place" onChange={onPendingChange} />
      </Link>
    </nav>
  );
}
