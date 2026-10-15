import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import type { ActivityEntry } from "@/lib/activity";
import { formatRelativeLong } from "@/lib/format-relative-time";

export interface ActivityFeedProps {
  entries: readonly ActivityEntry[];
  /** Overridable so the This week / Earlier split is testable. */
  now?: Date;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ITEM_LINK_CLASS =
  "rounded-sm font-semibold underline-offset-2 outline-none hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** What one event reads as: a sentence after the actor, and an optional second line. */
interface Description {
  headline: ReactNode;
  detail?: ReactNode;
}

function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold">{children}</span>;
}

function ItemLink({ entry, name }: { entry: ActivityEntry; name: string }) {
  return (
    <Link href={`/items/${entry.subjectId}`} className={ITEM_LINK_CLASS}>
      {name}
    </Link>
  );
}

/** "A → B", or "to B" when the earlier place wasn't recorded (a backfilled move). */
function describeMove(from: string | null, to: string | null, topLevel: string): string {
  const target = to ?? topLevel;
  return from === null ? `to ${target}` : `${from} → ${target}`;
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
        detail: entry.toText ? `in ${entry.toText}` : undefined,
      };
    case "item_moved":
      return {
        headline: (
          <>
            moved <ItemLink entry={entry} name={entry.subjectName} />
          </>
        ),
        detail: describeMove(entry.fromText, entry.toText, "the top level"),
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
        detail: entry.detailText ? `“${entry.detailText}”` : "removed the detail",
      };
    case "item_deleted":
      return {
        headline: (
          <>
            deleted <Strong>{entry.subjectName}</Strong>
          </>
        ),
        detail: entry.fromText ? `was in ${entry.fromText}` : undefined,
      };
    case "place_renamed":
      return {
        headline: "renamed a place",
        detail: `${entry.fromText ?? ""} → ${entry.toText ?? entry.subjectName}`.trim(),
      };
    case "place_moved":
      return {
        headline: (
          <>
            moved the place <Strong>{entry.subjectName}</Strong>
          </>
        ),
        detail: `${entry.fromText ?? "Top level"} → ${entry.toText ?? "Top level"}`,
      };
    case "place_deleted":
      return {
        headline: (
          <>
            deleted the place <Strong>{entry.subjectName}</Strong>
          </>
        ),
        detail: `was in ${entry.fromText ?? "the top level"}`,
      };
  }
}

function FeedEntry({ entry, now }: { entry: ActivityEntry; now: Date }) {
  const { headline, detail } = describe(entry);
  return (
    <li className="border-b border-[#ececec] py-[9px] last:border-b-0">
      <p className="text-[13px] break-words text-ink">
        <Strong>{entry.actor}</Strong> {headline}
      </p>
      {detail ? <p className="font-wire-mono text-[10.5px] tracking-[-0.01em] break-words text-mid">{detail}</p> : null}
      {/* text-mid, not the lighter --dim token: axe-core flagged
          --dim's 2.81:1 contrast against the paper background as a
          WCAG AA failure (needs 4.5:1 for text this size) — text-mid
          clears it at 5.33:1. */}
      <time dateTime={entry.at.toISOString()} title={entry.at.toLocaleString()} className="text-[9.5px] text-mid">
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
    <section aria-label={title} className="flex flex-col">
      <h2 className="border-b border-line pt-3 pb-[3px] text-[10.5px] font-bold tracking-[.06em] text-mid uppercase first:pt-0">
        {title}
      </h2>
      <ol className="flex flex-col">
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
    <div className="flex flex-col">
      <FeedGroup title="This week" entries={thisWeek} now={now} />
      <FeedGroup title="Earlier" entries={earlier} now={now} />
    </div>
  );
}
