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
 * - A "moved" event fires only when `lastMovedBy` is set AND `lastMovedAt`
 *   is strictly after `addedAt` — i.e. a genuinely distinct event from the
 *   add, not just every item's move fields getting initialized to its add
 *   fields at creation time (which is how every never-moved fixture item is
 *   actually shaped: `lastMovedAt === addedAt`, no `lastMovedBy`). An item
 *   with `lastMovedBy` set but no `addedAt` to compare against is treated
 *   as a real move — there's nothing to compare it to, so the recorded
 *   mover is trusted.
 */
export function getActivityEvents(items: readonly Item[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const item of items) {
    if (item.addedBy && item.addedAt) {
      events.push({ id: `${item.id}:added`, verb: "added", actor: item.addedBy, item, at: item.addedAt });
    }

    const { lastMovedBy, lastMovedAt, addedAt } = item;
    const isDistinctMove = lastMovedBy && lastMovedAt && (!addedAt || lastMovedAt.getTime() > addedAt.getTime());
    if (lastMovedBy && lastMovedAt && isDistinctMove) {
      events.push({ id: `${item.id}:moved`, verb: "moved", actor: lastMovedBy, item, at: lastMovedAt });
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}