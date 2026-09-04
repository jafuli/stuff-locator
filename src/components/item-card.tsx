import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatRelativeShort } from "@/lib/format-relative-time";
import type { Item } from "@/lib/fixtures/types";
import { LocationBreadcrumb, type LocationBreadcrumbSegment } from "@/components/location-breadcrumb";

export interface ItemCardProps {
  item: Item;
  /** Already-resolved breadcrumb for item.locationId — see LocationBreadcrumb. */
  segments: LocationBreadcrumbSegment[];
  /** Where this card links to — typically an item's `/items/${id}` detail route. */
  href: string;
  /**
   * When true, the breadcrumb's own segments become links to `/browse/[id]`
   * (AC #4, home page only). An `<a>` can't nest another `<a>`, so in this
   * mode the row can no longer be one big anchor: the name/detail/timestamp
   * block stays a single `<Link>` (full tap target, unchanged), and the
   * breadcrumb renders as its own linked line below it, outside that anchor.
   * Defaults to false, which keeps today's exact single-anchor row.
   */
  linkLocationSegments?: boolean;
}

/**
 * A single row in an item list: name, full location path, optional
 * free-text detail, and a relative-time badge — matches the wireframes'
 * `.item` row exactly. No match-source tag slot (that decision was settled
 * ahead of this component set — see the task Notes).
 */
export function ItemCard({ item, segments, href, linkLocationSegments = false }: ItemCardProps) {
  const lastTouched = item.lastMovedAt ?? item.addedAt;
  const linkClasses =
    "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  const nameAndDetail = (
    <div>
      <div className="text-[13.5px] font-semibold text-ink">{item.name}</div>
      {item.detail ? <div className="mt-0.5 text-[10.5px] text-mid italic">{item.detail}</div> : null}
    </div>
  );

  const timeBadge = lastTouched ? (
    <div className="shrink-0 pt-0.5 text-[9.5px] whitespace-nowrap text-[#a0a0a0]">
      {formatRelativeShort(lastTouched)}
    </div>
  ) : null;

  if (!linkLocationSegments) {
    return (
      <Link
        href={href}
        className={cn("flex items-start justify-between gap-2 border-b border-[#ececec] py-[9px] last:border-b-0", linkClasses)}
      >
        <div>
          {nameAndDetail}
          <LocationBreadcrumb segments={segments} />
        </div>
        {timeBadge}
      </Link>
    );
  }

  return (
    <div className="border-b border-[#ececec] py-[9px] last:border-b-0">
      <Link href={href} className={cn("flex items-start justify-between gap-2", linkClasses)}>
        {nameAndDetail}
        {timeBadge}
      </Link>
      <LocationBreadcrumb segments={segments} linked />
    </div>
  );
}
