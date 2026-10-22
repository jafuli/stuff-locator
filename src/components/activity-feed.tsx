import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "@/components/icons";
import { PathTrail } from "@/components/path-trail";
import { EmptyState } from "@/components/ui/empty-state";
import { pathSegmentsFromText, type ActivityEntry } from "@/lib/activity";
import { firstNameOf } from "@/lib/display-name";
import { formatRelativeLong } from "@/lib/format-relative-time";

export interface ActivityFeedProps {
  entries: readonly ActivityEntry[];
  /** Overridable so the This week / Earlier split is testable. */
  now?: Date;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ITEM_LINK_CLASS =
  "rounded-tape font-medium underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** What one event reads as: a sentence after the actor, and an optional second line. */
interface Description {
  headline: ReactNode;
  detail?: ReactNode;
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-medium">{children}</span>;
}

function ItemLink({ entry, name }: { entry: ActivityEntry; name: string }) {
  return (
    <Link href={`/items/${entry.subjectId}`} className={ITEM_LINK_CLASS}>
      {name}
    </Link>
  );
}

/**
 * A renamed place's "to": its old path with the last segment swapped for the
 * new name (the event stores the new name bare, not the whole path).
 */
function renamedPath(entry: ActivityEntry): string {
  const parents = pathSegmentsFromText(entry.fromText).slice(0, -1);
  return [...parents.map((segment) => segment.name), entry.toText ?? entry.subjectName].join(" › ");
}

/** A word, then a path: "in Garage › Shelf", "was in Office › Cabinet". */
function TrailAfter({ word, path }: { word: string; path: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-meta text-muted">{word} </span>
      <PathTrail segments={pathSegmentsFromText(path)} />
    </span>
  );
}

/**
 * Where it was and where it went, as two PathTrails with an arrow between
 * them — or just "to <path>" when the earlier place wasn't recorded (a
 * backfilled move). A missing side is the top level, which has no path to
 * put on tape, so it's plain muted text. The arrow is decorative; assistive
 * tech hears "to".
 */
function Move({
  from,
  to,
  topLevelOnBothSides = false,
}: {
  from: string | null;
  to: string | null;
  /** Place moves name the top level on either side; item moves never show a "from" they don't have. */
  topLevelOnBothSides?: boolean;
}) {
  const side = (text: string | null, fallback: string) =>
    text === null ? (
      <span className="text-meta text-muted">{fallback}</span>
    ) : (
      <PathTrail segments={pathSegmentsFromText(text)} />
    );

  if (from === null && !topLevelOnBothSides) {
    return <TrailAfter word="to" path={to ?? "Top level"} />;
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {side(from, "Top level")}
      <ArrowRightIcon className="shrink-0 text-faint" width={16} height={16} />
      <span className="sr-only">to</span>
      {side(to, "Top level")}
    </span>
  );
}

/**
 * One place per kind, so adding a kind is a type error until it is rendered
 * here. An item that was deleted has no page to link to, so only the kinds
 * about a still-existing item link out.
 */
function describe(entry: ActivityEntry): Description {
  switch (entry.kind) {
    case "item_added":
      return {
        headline: (
          <>
            added <ItemLink entry={entry} name={entry.subjectName} />
          </>
        ),
        detail: entry.toText ? <TrailAfter word="in" path={entry.toText} /> : undefined,
      };
    case "item_moved":
      return {
        headline: (
          <>
            moved <ItemLink entry={entry} name={entry.subjectName} />
          </>
        ),
        detail: <Move from={entry.fromText} to={entry.toText} />,
      };
    case "item_renamed":
      return {
        headline: (
          <>
            renamed <Strong>{entry.fromText ?? "an item"}</Strong> → <ItemLink entry={entry} name={entry.subjectName} />
          </>
        ),
      };
    case "item_detail_changed":
      return {
        headline: (
          <>
            edited the detail of <ItemLink entry={entry} name={entry.subjectName} />
          </>
        ),
        detail: (
          <span className="text-meta text-muted">
            {entry.detailText ? `“${entry.detailText}”` : "removed the detail"}
          </span>
        ),
      };
    case "item_deleted":
      return {
        headline: (
          <>
            deleted <Strong>{entry.subjectName}</Strong>
          </>
        ),
        detail: entry.fromText ? <TrailAfter word="was in" path={entry.fromText} /> : undefined,
      };
    case "place_renamed":
      return {
        headline: "renamed a place",
        detail: <Move from={entry.fromText} to={renamedPath(entry)} />,
      };
    case "place_moved":
      return {
        headline: (
          <>
            moved the place <Strong>{entry.subjectName}</Strong>
          </>
        ),
        detail: <Move from={entry.fromText} to={entry.toText} topLevelOnBothSides />,
      };
    case "place_deleted":
      return {
        headline: (
          <>
            deleted the place <Strong>{entry.subjectName}</Strong>
          </>
        ),
        detail: entry.fromText ? (
          <TrailAfter word="was in" path={entry.fromText} />
        ) : (
          <span className="text-meta text-muted">was in the top level</span>
        ),
      };
  }
}

function FeedEntry({ entry, now }: { entry: ActivityEntry; now: Date }) {
  const { headline, detail } = describe(entry);
  return (
    <li className="flex min-h-14 flex-col gap-1 border-b border-divider px-4 py-3 last:border-b-0">
      <p className="text-body break-words text-ink">
        <Strong>{firstNameOf(entry.actor) ?? entry.actor}</Strong> {headline}
      </p>
      {detail}
      <time dateTime={entry.at.toISOString()} title={entry.at.toLocaleString()} className="text-meta text-muted">
        {formatRelativeLong(entry.at, now)}
      </time>
    </li>
  );
}

function FeedGroup({ title, entries, now }: { title: string; entries: readonly ActivityEntry[]; now: Date }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-section-label text-muted">{title}</h2>
      <ol className="overflow-hidden rounded-panel border border-hairline bg-surface">
        {entries.map((entry) => (
          <FeedEntry key={entry.id} entry={entry} now={now} />
        ))}
      </ol>
    </section>
  );
}

/**
 * The chronological "who changed what" feed on /activity, grouped into
 * This week and Earlier, or the empty state when nothing has ever happened.
 * Pulled out of the page component so the empty branch is directly
 * unit-testable — same split StuffList already makes for the home route.
 *
 * Entries arrive newest-first from the service and keep that order within
 * each group.
 */
export function ActivityFeed({ entries, now = new Date() }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        description="When you or your partner stashes, moves or tidies something, it'll show up here."
      />
    );
  }

  const cutoff = now.getTime() - WEEK_MS;
  const thisWeek = entries.filter((entry) => entry.at.getTime() > cutoff);
  const earlier = entries.filter((entry) => entry.at.getTime() <= cutoff);

  return (
    <div className="flex flex-col gap-6">
      <FeedGroup title="This week" entries={thisWeek} now={now} />
      <FeedGroup title="Earlier" entries={earlier} now={now} />
    </div>
  );
}
