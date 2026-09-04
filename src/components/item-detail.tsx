import { formatRelativeShort } from "@/lib/format-relative-time";
import type { Item } from "@/lib/fixtures/types";
import { LocationBreadcrumb, type LocationBreadcrumbSegment } from "@/components/location-breadcrumb";

export interface ItemDetailProps {
  item: Item;
  /** Already-resolved breadcrumb for item.locationId — see LocationBreadcrumb. */
  segments: LocationBreadcrumbSegment[];
}

interface Field {
  label: string;
  value: string;
}

/**
 * Every optional Item field that has a value, in display order. `id` and
 * `locationId` are deliberately excluded: `locationId` already has its
 * human-readable form as the breadcrumb above (the same substitution
 * ItemCard makes on the list row), and `id` is the URL/route context, not
 * user-facing content — showing the raw slug next to a proper breadcrumb
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
    fields.push({ label: "Added", value: `${formatRelativeShort(item.addedAt)} ago` });
  }
  if (item.lastMovedBy) {
    fields.push({ label: "Last moved by", value: item.lastMovedBy });
  }
  if (item.lastMovedAt) {
    fields.push({ label: "Last moved", value: `${formatRelativeShort(item.lastMovedAt)} ago` });
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
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-[18px] font-semibold text-ink">{item.name}</h1>
        <LocationBreadcrumb segments={segments} />
      </div>

      {fields.length > 0 ? (
        <dl className="flex flex-col gap-2 border-t border-line pt-3">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-[9.5px] tracking-[.06em] text-mid uppercase">{field.label}</dt>
              <dd className="text-[12.5px] text-ink">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
