// MOCK DATA derivation — see types.ts. Real activity would come from a
// household-scoped audit read (CLAUDE.md); this is the fixture-only
// equivalent, derived entirely from ITEMS' existing provenance fields with
// no new fixture data or fields.
import type { Item } from "./types";

export type ActivityVerb = "added" | "moved";

/** One entry in the activity feed: who did what to which item, and when. */
export interface ActivityEvent {
  id: string;
  verb: ActivityVerb;
  actor: string;
  item: Item;
  at: Date;
}

/**
 * Derives a flat, newest-first activity feed from ITEMS' own provenance
 * fields — no new fields invented.
 *
 * - An "added" event fires when both `addedBy` and `addedAt` are set.
 * - A "moved" event fires whenever `lastMovedBy` and `lastMovedAt` are both
 *   set, UNLESS it would just be a duplicate of the "added" event above —
 *   i.e. only suppressed when an "added" event was actually pushed for this
 *   item AND `lastMovedAt` doesn't postdate `addedAt`. This is how every
 *   never-moved fixture item is actually shaped: `lastMovedAt === addedAt`,
 *   no `lastMovedBy`, so the "moved" branch never even reaches the
 *   duplicate check for those.
 *
 *   Deliberately NOT gated on "is this distinct from the add" when there's
 *   no add event to be a duplicate of (`addedBy` or `addedAt` missing) —
 *   a record with a genuine `lastMovedBy` but incomplete add provenance
 *   (plausible once this reads from a real, evolving Supabase table
 *   instead of a hand-written fixture) must still surface its move; the
 *   earlier version of this logic compared `lastMovedAt` against `addedAt`
 *   unconditionally and silently dropped that item from the feed entirely
 *   when the comparison didn't favor it.
 */
export function getActivityEvents(items: readonly Item[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const item of items) {
    const { addedBy, addedAt, lastMovedBy, lastMovedAt } = item;
    const addedEventPushed = Boolean(addedBy && addedAt);

    if (addedBy && addedAt) {
      events.push({ id: `${item.id}:added`, verb: "added", actor: addedBy, item, at: addedAt });
    }

    if (lastMovedBy && lastMovedAt) {
      const isDuplicateOfAdd = addedEventPushed && addedAt !== undefined && lastMovedAt.getTime() <= addedAt.getTime();
      if (!isDuplicateOfAdd) {
        events.push({ id: `${item.id}:moved`, verb: "moved", actor: lastMovedBy, item, at: lastMovedAt });
      }
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}