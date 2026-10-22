import type { Database } from "@/lib/database.types";

/**
 * The eight things the Activity feed can show (ADR 0011). Taken from the
 * `activity_events.kind` check constraint so a ninth kind added in a
 * migration is a type error here until the feed knows how to render it.
 */
export type ActivityKind =
  | "item_added"
  | "item_moved"
  | "item_renamed"
  | "item_detail_changed"
  | "item_deleted"
  | "place_renamed"
  | "place_moved"
  | "place_deleted";

type EventRow = Database["public"]["Tables"]["activity_events"]["Row"];

/**
 * One feed entry, with the actor already resolved to a display name — an
 * id on screen is a bug (see display-name.ts). The text fields are
 * snapshots taken when the event happened; their meaning depends on `kind`
 * and is documented in the migration that created the table.
 */
export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  actor: string;
  subjectId: string;
  subjectName: string;
  fromText: string | null;
  toText: string | null;
  detailText: string | null;
  at: Date;
}

const KINDS: ReadonlySet<string> = new Set<ActivityKind>([
  "item_added",
  "item_moved",
  "item_renamed",
  "item_detail_changed",
  "item_deleted",
  "place_renamed",
  "place_moved",
  "place_deleted",
]);

export function isActivityKind(value: string): value is ActivityKind {
  return KINDS.has(value);
}

/**
 * Maps a database row to a feed entry. Returns null for a kind this build
 * doesn't know (a newer migration than the deployed app), so one unknown row
 * is skipped instead of taking the whole feed down.
 */
export function toActivityEntry(row: EventRow, actor: string): ActivityEntry | null {
  if (!isActivityKind(row.kind)) {
    return null;
  }
  return {
    id: row.id,
    kind: row.kind,
    actor,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    fromText: row.from_text,
    toText: row.to_text,
    detailText: row.detail_text,
    at: new Date(row.created_at),
  };
}

/**
 * Splits one of an event's path snapshots ("Garage › Closet › Toolbox") into
 * PathTrail segments. The snapshot is only text — the places may have been
 * renamed, moved or deleted since — so the segments carry synthetic ids and
 * the trail is never linked.
 */
export function pathSegmentsFromText(text: string | null | undefined): { id: string; name: string }[] {
  return (text ?? "")
    .split("›")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name, index) => ({ id: `${String(index)}-${name}`, name }));
}
