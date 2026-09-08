import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LocationBreadcrumb, type LocationBreadcrumbSegment } from "@/components/location-breadcrumb";
import { formatRelativeLong } from "@/lib/format-relative-time";
import type { ActivityEvent } from "@/lib/fixtures/activity";

export interface ActivityFeedEntry {
  event: ActivityEvent;
  /** Already-resolved breadcrumb for event.item.locationId — see LocationBreadcrumb. */
  segments: LocationBreadcrumbSegment[];
}

export interface ActivityFeedProps {
  entries: readonly ActivityFeedEntry[];
}

const VERB_LABEL: Record<ActivityEvent["verb"], string> = {
  added: "added",
  moved: "moved",
};

/**
 * The chronological "who changed what" feed on /activity, or the empty
 * state when nothing has ever been added/moved. Pulled out of the page
 * component so the empty branch is directly unit-testable — same split
 * StuffList already makes for the home route.
 *
 * Each entry's item link and breadcrumb links are siblings, not nested —
 * an <a> can't contain another <a>, same constraint ItemCard's
 * linkLocationSegments mode works around.
 */
export function ActivityFeed({ entries }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        description="When you or your partner stashes or moves something, it'll show up here."
      />
    );
  }

  return (
    <ol className="flex flex-col">
      {entries.map(({ event, segments }) => (
        <li key={event.id} className="border-b border-[#ececec] py-[9px] last:border-b-0">
          <p className="text-[13px] text-ink">
            <span className="font-semibold">{event.actor}</span> <span>{VERB_LABEL[event.verb]}</span>{" "}
            <Link
              href={`/items/${event.item.id}`}
              className="rounded-sm font-semibold underline-offset-2 outline-none hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {event.item.name}
            </Link>
          </p>
          <LocationBreadcrumb segments={segments} linked />
          <time dateTime={event.at.toISOString()} title={event.at.toLocaleString()} className="text-[9.5px] text-[#a0a0a0]">
            {formatRelativeLong(event.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
