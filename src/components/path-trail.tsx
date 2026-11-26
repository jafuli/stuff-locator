"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { LocationBreadcrumbSegment } from "@/lib/fixtures/location-path";

export type { LocationBreadcrumbSegment };

export interface PathTrailProps {
  /** Already-resolved root→leaf segments for a location — see getBreadcrumbSegments. */
  segments: LocationBreadcrumbSegment[];
  /**
   * When true, each segment links to `/browse/[id]` (item rows on the Stuff
   * screen use this to give every path a way into Browse). Defaults to false:
   * the same inert label as everywhere else.
   */
  linked?: boolean;
  /**
   * Prints the tape in, left to right, when the trail mounts. For the moment
   * a path has just been saved (the Stash success panel); a path that was
   * already there just appears. Off under prefers-reduced-motion.
   */
  printIn?: boolean;
  /**
   * Collapse to "first › … › last" from this many segments, at every width.
   * Activity sets 4 so long from → to paths stay readable (ADR 0015). Left
   * unset, the trail collapses only under 360px, from 3 segments.
   */
  collapseFrom?: number;
}

const NARROW_QUERY = "(max-width: 359px)";
/** Under 360px a path collapses from this many segments (one middle segment or more). */
const NARROW_COLLAPSE_FROM = 3;

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function isNarrow(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
}

/** Server render and the first client render assume a wide screen, so the markup always hydrates; a narrow one re-renders straight away. */
function isNarrowOnServer(): boolean {
  return false;
}

// No nowrap: a step that fits on a line moves to the next line whole (see
// the doc comment); only a step wider than the line wraps inside, at its
// spaces first and mid-word only for one unbroken word.
const SEGMENT_CLASSES = "inline-flex min-h-6 min-w-0 items-center wrap-anywhere";
const LINK_CLASSES = "rounded-tape hover:underline focus-ring";
// Only the last segment is ever on tape — the location is the hero.
// A minimum height, so a name too long for one line grows the tape downwards.
const TAPE_CLASSES = "min-h-tape-height rounded-tape bg-tape px-2 text-on-tape shadow-tape";

/**
 * The design system's PathTrail: a location path in uppercase mono, with
 * `›` separators in `faint` and ONLY the last segment on label tape —
 * `BEDROOM › DESK › [TOP DRAWER]`. It stays on one line and, when it has
 * to, wraps after a `›`: each step (a name and the `›` after it) is one
 * flex item, and flex wrapping moves a step that fits on the next line
 * there whole. Only a step wider than a whole line breaks inside its name:
 * at a space if it has one, anywhere if it is one unbroken word. It never
 * spills out of its row.
 *
 * Under 360px a path with middle segments collapses them to a "…" button
 * that expands them; the button's label names the whole path, so assistive
 * tech still hears every segment. With `collapseFrom`, a path that long
 * collapses the same way at any width. The collapse is decided in JS from a
 * media query (not hidden with CSS), so a collapsed trail's DOM — and its
 * text — really is just "first › … › last", and a wide one is never
 * affected.
 */
export function PathTrail({ segments, linked = false, printIn = false, collapseFrom }: PathTrailProps) {
  const [expanded, setExpanded] = useState(false);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, isNarrowOnServer);

  if (segments.length === 0) {
    return null;
  }

  const lastIndex = segments.length - 1;
  const longEnough =
    collapseFrom === undefined
      ? narrow && segments.length >= NARROW_COLLAPSE_FROM
      : segments.length >= Math.max(collapseFrom, NARROW_COLLAPSE_FROM);
  const collapsed = longEnough && !expanded;
  const visible = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ index }) => !collapsed || index === 0 || index === lastIndex);

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-path text-muted">
      {visible.map(({ segment, index }) => {
        const isLast = index === lastIndex;
        const segmentClasses = cn(SEGMENT_CLASSES, isLast && cn(TAPE_CLASSES, printIn && "animate-tape-print"));
        return (
          <span key={segment.id} className="inline-flex min-w-0 items-center gap-x-1.5">
            {linked ? (
              <Link href={`/browse/${segment.id}`} className={cn(segmentClasses, LINK_CLASSES)}>
                {segment.name}
              </Link>
            ) : (
              <span className={segmentClasses}>{segment.name}</span>
            )}
            {isLast ? null : <Separator />}
            {index === 0 && collapsed ? (
              <>
                <button
                  type="button"
                  aria-expanded="false"
                  aria-label={`Show the full path: ${segments.map((s) => s.name).join(", ")}`}
                  onClick={() => {
                    setExpanded(true);
                  }}
                  className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-tape border border-border-strong px-1 text-muted focus-ring"
                >
                  …
                </button>
                <Separator />
              </>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="shrink-0 text-faint">
      {" › "}
    </span>
  );
}
