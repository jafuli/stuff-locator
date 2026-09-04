import Link from "next/link";
import type { LocationBreadcrumbSegment } from "@/lib/fixtures/location-path";

export type { LocationBreadcrumbSegment };

export interface LocationBreadcrumbProps {
  /** Already-resolved root→leaf segments for a location — see getBreadcrumbSegments. */
  segments: LocationBreadcrumbSegment[];
  /**
   * When true, each segment links to `/browse/[id]` instead of rendering as
   * plain text — used on the home page (AC #4) to give item rows a real
   * entry point into Browse. Defaults to false everywhere else (item detail,
   * Browse's own breadcrumb) so this stays the same inert label it always
   * was for those callers.
   */
  linked?: boolean;
}

/**
 * Renders a full location path, inline, the way it appears on item rows in
 * the wireframes (`Garage › Closet › Toolbox › Red box`). Deliberately never
 * truncates: no `truncate`/`overflow-hidden`/`whitespace-nowrap` anywhere,
 * so a long path wraps onto more lines instead of being cut off — the full
 * path is the actual answer to "where is it?", and hiding part of it would
 * defeat the point.
 */
export function LocationBreadcrumb({ segments, linked = false }: LocationBreadcrumbProps) {
  if (segments.length === 0) {
    return null;
  }

  if (!linked) {
    return (
      <p className="font-wire-mono text-[10.5px] tracking-[-0.01em] text-mid">
        {segments.map((segment) => segment.name).join(" › ")}
      </p>
    );
  }

  return (
    <p className="font-wire-mono text-[10.5px] tracking-[-0.01em] text-mid">
      {segments.map((segment, index) => (
        <span key={segment.id}>
          {index > 0 ? " › " : null}
          <Link
            href={`/browse/${segment.id}`}
            className="rounded-sm underline-offset-2 outline-none hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {segment.name}
          </Link>
        </span>
      ))}
    </p>
  );
}
