import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatRelativeLong } from "@/lib/format-relative-time";
import type { Item } from "@/lib/fixtures/types";
import { PathTrail, type LocationBreadcrumbSegment } from "@/components/path-trail";

export interface ItemCardProps {
  item: Item;
  /** Already-resolved path for item.locationId — see PathTrail. */
  segments: LocationBreadcrumbSegment[];
  /** Where this card links to — typically an item's `/items/${id}` detail route. */
  href: string;
  /**
   * When true, the path's own segments become links to `/browse/[id]`
   * (home page only). An `<a>` can't nest another `<a>`, so in this mode the
   * row can no longer be one big anchor: the title/detail block stays a
   * single `<Link>` (full tap target), and the path renders as its own
   * linked line below it, outside that anchor. Defaults to false, which
   * keeps the single-anchor row.
   */
  linkLocationSegments?: boolean;
  /** First name of whoever last touched the item, for the meta line ("Noa, 3 days ago"). Omitted when unknown. */
  byName?: string;
  /** Marks this row as the top search result with the CLOSEST marker. Never a score. */
  closest?: boolean;
}

// Rows sit in a panel with overflow hidden, so the focus ring is drawn
// inside the row rather than offset outside it (where it would be clipped).
const LINK_CLASSES = "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

/**
 * A single ResultList row: title, optional detail, the full path (last
 * segment on tape) and a meta line — "Noa, 3 days ago". At least 56px tall.
 * No similarity score and no match-source tag; the only search furniture is
 * the CLOSEST marker on the first result.
 */
export function ItemCard({
  item,
  segments,
  href,
  linkLocationSegments = false,
  byName,
  closest = false,
}: ItemCardProps) {
  const lastTouched = item.lastMovedAt ?? item.addedAt;
  const meta = lastTouched
    ? [byName, formatRelativeLong(lastTouched)].filter((part): part is string => Boolean(part)).join(", ")
    : null;

  const titleAndDetail = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-title text-ink">{item.name}</span>
        {closest ? <span className="shrink-0 text-marker text-signal">Closest</span> : null}
      </span>
      {item.detail ? <span className="block text-meta text-muted">{item.detail}</span> : null}
    </>
  );
  const metaLine = meta ? <p className="text-meta text-muted">{meta}</p> : null;

  if (!linkLocationSegments) {
    return (
      <Link
        href={href}
        className={cn("flex min-h-14 flex-col gap-1 border-b border-divider px-4 py-3 last:border-b-0", LINK_CLASSES)}
      >
        {titleAndDetail}
        <PathTrail segments={segments} />
        {metaLine}
      </Link>
    );
  }

  return (
    <div className="flex min-h-14 flex-col gap-1 border-b border-divider px-4 py-3 last:border-b-0">
      <Link href={href} className={cn("flex flex-col gap-1 rounded-tape", LINK_CLASSES)}>
        {titleAndDetail}
      </Link>
      <PathTrail segments={segments} linked />
      {metaLine}
    </div>
  );
}
