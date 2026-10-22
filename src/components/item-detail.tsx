import { formatRelativeLong } from "@/lib/format-relative-time";
import type { Item } from "@/lib/fixtures/types";
import { PathTrail, type LocationBreadcrumbSegment } from "@/components/path-trail";

export interface ItemDetailProps {
  item: Item;
  /** Already-resolved path for item.locationId — see PathTrail. */
  segments: LocationBreadcrumbSegment[];
}

interface Field {
  label: string;
  value: string;
}

/**
 * Every optional Item field that has a value, in display order. `id` and
 * `locationId` are deliberately excluded: `locationId` already has its
 * human-readable form as the path above (the same substitution
 * ItemCard makes on the list row), and `id` is the URL/route context, not
 * user-facing content — showing the raw slug next to a proper path
 * would be redundant, not more complete.
 */
function fieldsFor(item: Item): Field[] {
  const fields: Field[] = [];
  if (item.detail) {
    fields.push({ label: "Detail", value: item.detail });
  }
  if (item.addedBy) {
    fields.push({ label: "Added by", value: item.addedBy });
  }
  if (item.addedAt) {
    fields.push({ label: "Added", value: formatRelativeLong(item.addedAt) });
  }
  if (item.lastMovedBy) {
    fields.push({ label: "Last moved by", value: item.lastMovedBy });
  }
  if (item.lastMovedAt) {
    fields.push({ label: "Last moved", value: formatRelativeLong(item.lastMovedAt) });
  }
  return fields;
}

/**
 * Full detail for a single item: name (as the page heading), full location
 * path, and every other Item field that has a value. Pulled out of the route
 * so it's directly unit-testable — mirrors the split StuffList already makes
 * for the home route's list.
 */
export function ItemDetail({ item, segments }: ItemDetailProps) {
  const fields = fieldsFor(item);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-display break-words text-ink">{item.name}</h1>
        <PathTrail segments={segments} />
      </div>

      {fields.length > 0 ? (
        <dl className="overflow-hidden rounded-panel border border-hairline bg-surface">
          {fields.map((field) => (
            <div
              key={field.label}
              className="flex min-h-14 flex-col justify-center gap-1 border-b border-divider px-4 py-3 last:border-b-0"
            >
              <dt className="text-section-label text-muted">{field.label}</dt>
              <dd className="text-body break-words text-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
