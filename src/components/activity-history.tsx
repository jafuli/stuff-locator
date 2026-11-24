"use client";

import { useEffect, useRef, useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { Button } from "@/components/ui/button";
import { fetchActivityPage, type ActivityPage } from "@/lib/activity-page";
import { ACTIVITY_RETENTION } from "@/lib/limits";
import { createClient } from "@/server/db/client";

export interface ActivityHistoryProps {
  householdId: string;
  /** The first page, read on the server. */
  initial: ActivityPage;
  /**
   * The server's "now", as an ISO string: relative times ("2 hours ago") and
   * the This week / Earlier split must come out the same on the server and
   * on hydration.
   */
  now: string;
}

const LOAD_FAILED = "Earlier activity couldn't be loaded. Check your connection and try again.";

/**
 * The whole Activity history a household keeps (the newest
 * ACTIVITY_RETENTION events), a page at a time: the first page comes from
 * the server, and "Show earlier activity" appends the next one, read from
 * the browser through RLS (fetchActivityPage, keyset on created_at + id).
 *
 * Paged rather than virtualized: at most a few hundred rows is no load for
 * the DOM, and a real list keeps find-in-page, screen readers' list
 * navigation and the This week / Earlier headings intact. What a page saves
 * is the transfer, which on a phone is the real cost.
 *
 * Focus stays on the button, which stays at the bottom as rows arrive above
 * it, and a status message says how many were added. When the last page is
 * in, the button gives way to a note saying that's everything, and focus
 * moves to it so it isn't lost with the button.
 */
export function ActivityHistory({ householdId, initial, now }: ActivityHistoryProps) {
  const [entries, setEntries] = useState(initial.entries);
  const [next, setNext] = useState(initial.next);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const endRef = useRef<HTMLParagraphElement>(null);
  const atEnd = next === null && pagesLoaded > 1;

  useEffect(() => {
    if (atEnd) {
      endRef.current?.focus();
    }
  }, [atEnd]);

  async function loadEarlier() {
    if (next === null || isLoading) {
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const page = await fetchActivityPage(createClient(), householdId, next);
      setEntries((current) => {
        // Keyset pages can't overlap, but a double tap must never show a row twice.
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...page.entries.filter((entry) => !seen.has(entry.id))];
      });
      setNext(page.next);
      setPagesLoaded((count) => count + 1);
      setAnnouncement(
        page.entries.length === 1
          ? "Showing 1 earlier change."
          : `Showing ${String(page.entries.length)} earlier changes.`,
      );
    } catch {
      setError(LOAD_FAILED);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ActivityFeed entries={entries} now={new Date(now)} />
      {next === null ? null : (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            isLoading={isLoading}
            // Kept enabled while loading (aria-busy says it's busy): a
            // disabled button would drop keyboard focus to the page.
            disabled={false}
            onClick={() => {
              void loadEarlier();
            }}
            className="w-full sm:w-fit"
          >
            {isLoading ? "Loading…" : "Show earlier activity"}
          </Button>
          {error === null ? null : (
            <p role="alert" className="text-meta text-signal">
              {error}
            </p>
          )}
        </div>
      )}
      {atEnd ? (
        <p ref={endRef} tabIndex={-1} className="text-meta text-muted outline-none">
          That&apos;s everything: the newest {ACTIVITY_RETENTION} changes are kept.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
