import { ActivityFeed, type ActivityFeedEntry } from "@/components/activity-feed";
import { getActivityEvents } from "@/lib/fixtures/activity";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";

// Catch up, core flow #4: a chronological "who changed what" feed derived
// from ITEMS' own add/move provenance fields — see
// src/lib/fixtures/activity.ts. Replaces the earlier "coming soon"
// placeholder (Wire-the-Stuff-home-screen task, PR #3).
export default function ActivityPage() {
  const events = getActivityEvents(ITEMS);
  const entries: ActivityFeedEntry[] = events.map((event) => ({
    event,
    segments: getBreadcrumbSegments(event.item.locationId, LOCATIONS),
  }));

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Activity</h1>
      <ActivityFeed entries={entries} />
    </main>
  );
}
