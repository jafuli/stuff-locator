import { ItemCard } from "@/components/item-card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Item } from "@/lib/fixtures/types";

export interface StuffListEntry {
  item: Item;
  /** Root→leaf breadcrumb names for item.locationId — already resolved by the caller. */
  path: string[];
}

export interface StuffListProps {
  entries: readonly StuffListEntry[];
}

/**
 * The item list on the "everything" home view, or the empty state when
 * there's nothing stashed yet. Pulled out of the page component so the
 * empty branch is unit-testable directly — the real fixture data always has
 * items, so that branch is otherwise unreachable in the running app.
 *
 * Entries render as flat siblings under one container (not individually
 * wrapped in <li>s) because ItemCard's last:border-b-0 rule depends on true
 * sibling position — wrapping each in its own <li> would make every row its
 * parent's only (and therefore "last") child, silently dropping every
 * divider. Matches the existing /~components catalog page's pattern.
 */
export function StuffList({ entries }: StuffListProps) {
  if (entries.length === 0) {
    return <EmptyState title="No items yet" description="Stash your first thing to see it here." />;
  }

  return (
    <div>
      {entries.map(({ item, path }) => (
        <ItemCard key={item.id} item={item} path={path} href={`/items/${item.id}`} />
      ))}
    </div>
  );
}
