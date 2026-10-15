# 9. The Activity feed is derived from item provenance, not an audit log

**Status:** Accepted. Partly superseded by ADR 0011, which adds an
`activity_events` table for deletes, renames and edits. Item "added" and
"moved" are still derived from provenance as described here.

## Context

"Catch up" — who moved what — was the last route still rendering fixtures.
Items already carry `added_by`, `added_at`, `last_moved_by` and
`last_moved_at`, kept current by `move_item`. A true history (every move, every
edit, deletions) would need a new append-only events table written by every
mutation, including the atomic Postgres functions.

For a couple with 20–50 items, the question the feed answers is "what changed
while I was away?", not "show me the audit trail".

## Decision

`/activity` reads the household's items and locations (RLS-scoped, like Home),
resolves actors through `profiles` (`fetchDisplayNames`; unresolvable people
show as "Someone", never a uuid) and derives events with the existing
`getActivityEvents`: one "added" event per item and one "moved" event when the
last move is later than the add. The logic lives in
`src/server/services/activity.ts`, which takes its client as a parameter so it
is unit-testable with a fake.

The oldest-membership rule matches Home, so the feed describes the household
the person is looking at.

## Consequences

- Cheap and correct for what it shows; no migration, no new table, no changes
  to `move_item`.
- **It is not a history.** An item moved three times appears once as "moved"
  (the latest). Deleted items vanish from the feed. Edits (rename, detail)
  are not events. That limit is deliberate and is stated in CLAUDE.md.
- If a real history is wanted later: add an `item_events` table written inside
  `move_item` and the item mutations, and replace `getActivityEvents`' input.
  The feed component and the service's return shape would not change.

## Alternatives considered

- **An events table now.** Right shape for a real audit trail, but every
  mutation path (including `move_item` and, later, `move_container`) would
  grow a write, for a feature the product doesn't need at couple scale.
- **Postgres triggers on `items`.** Hidden writes with no access to the
  acting user's intent; the app's atomic operations are explicit functions
  for a reason (CLAUDE.md).
