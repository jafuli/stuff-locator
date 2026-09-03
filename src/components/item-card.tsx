import Link from "next/link";
import { formatRelativeShort } from "@/lib/format-relative-time";
import type { Item } from "@/lib/fixtures/types";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";

export interface ItemCardProps {
  item: Item;
  /** Already-resolved breadcrumb for item.locationId — see LocationBreadcrumb. */
  path: string[];
  /** Where this card links to. No item-detail route exists yet, so the caller decides. */
  href: string;
}

/**
 * A single row in an item list: name, full location path, optional
 * free-text detail, and a relative-time badge — matches the wireframes'
 * `.item` row exactly. No match-source tag slot (that decision was settled
 * ahead of this component set — see the task Notes).
 */
export function ItemCard({ item, path, href }: ItemCardProps) {
  const lastTouched = item.lastMovedAt ?? item.addedAt;

  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-2 border-b border-[#ececec] py-[9px] outline-none last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <div>
        <div className="text-[13.5px] font-semibold text-ink">{item.name}</div>
        <LocationBreadcrumb path={path} />
        {item.detail ? <div className="mt-0.5 text-[10.5px] text-mid italic">{item.detail}</div> : null}
      </div>
      {lastTouched ? (
        <div className="shrink-0 pt-0.5 text-[9.5px] whitespace-nowrap text-[#a0a0a0]">
          {formatRelativeShort(lastTouched)}
        </div>
      ) : null}
    </Link>
  );
}
