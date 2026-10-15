# 11. Activity events: an append-only table written inside the functions

**Status:** Accepted. Partly supersedes ADR 0009.

## Context

ADR 0009 derived the Activity feed from items' own provenance columns
(`added_by`, `added_at`, `last_moved_by`, `last_moved_at`). That is cheap and
correct for what it shows, and it stays right for two events: an item being
**added** and an item being **moved** (its latest move).

It cannot express the rest of what the Locations refactor makes possible:

- **Deletes.** A deleted item or place has no row left to carry a column.
- **Renames and edits.** The row holds only the *current* name or detail, so
  "who renamed it, and from what" is gone the moment it is overwritten.
- **Places at all.** `locations` has no provenance columns, and adding them
  would still not say who deleted one.

The question the feed answers is still "what changed while I was away?", not
"show me the audit trail". But "my partner deleted the box and I don't know
what happened to it" is exactly the failure Catch up exists for.

## Decision

An append-only **`activity_events`** table records:

| kind | written by |
|---|---|
| place renamed | `rename_location` |
| place moved | `move_container` |
| place deleted | `delete_container` |
| item renamed | `update_item` |
| item detail edited | `update_item` |
| item deleted | `delete_item` |

Item **added** and **moved** remain derived from provenance (ADR 0009). An
item's *earlier* moves are still not shown.

**Shape:**

- `household_id`: scopes reads and RLS.
- `actor_id`: who did it. Resolved to a display name at read time through
  `profiles`, as in ADR 0009; an unresolvable person shows as "Someone".
- `kind`: one of the six values above, constrained.
- `subject_id`: the item or place the event is about. **No foreign key**: the
  subject is often deleted, and the event has to outlive it.
- Text **snapshots** of the name and the full path *before* and *after*, as
  they were at the time. Old events stay readable after later renames and
  moves ("deleted *Bottom drawer*, was in *Office › Cabinet*").
- `created_at`.

An index on `(household_id, created_at desc)` serves the feed.

**Written in the same transaction as the change**, inside `rename_location`,
`move_container`, `delete_container`, `update_item` and `delete_item`. If the
change rolls back, so does its event; an event can't exist for something that
didn't happen.

**Clients read through RLS and can't write directly.** `authenticated` gets
`SELECT` and nothing else on `activity_events`, with a select policy on
`is_household_member(household_id)`. `service_role` keeps its grants for the
integration tests (ADR 0005). Events are therefore only ever appended by the
functions above, which are `SECURITY DEFINER` with `set search_path = public`
and an explicit `is_household_member` check, the same pattern ADR 0007
established for `household_members`.

## Consequences

- The feed gains deletes, renames and edits, with readable old values.
- **Making `move_container` and `delete_container` `SECURITY DEFINER` is a
  real change.** Today they are invoker functions and lean on RLS for
  authorization. As definer functions they must re-implement that check
  themselves, which is where a missed check would become a cross-household
  write. Each needs the explicit membership test first, and the RLS
  integration tests (`npm run test:rls`) must prove a non-member is refused.
  CLAUDE.md's "server-side clients forward the user's JWT so RLS still
  applies" is true for reads and for the functions that don't append events;
  it is not what protects these five.
- `actor_id` must come from `auth.uid()` inside the function, never from a
  parameter, or the actor could be forged.
- Snapshots are denormalised on purpose. They cost a little storage and mean
  a place's path is stored as text in many rows; that is the point.
- Ordering by `created_at` interleaves events with the provenance-derived
  ones in the service layer. The feed component and `getActivityEvents`'
  return shape do not change.

## Alternatives considered

- **Provenance columns on `locations`** (`renamed_by`, `moved_by`, …). Follows
  ADR 0009's approach, but cannot express a delete, and keeps only the latest
  of each.
- **Postgres triggers on `items` and `locations`.** Would capture every write
  automatically, but a trigger has no access to the acting user's intent (a
  move and an unrelated update look alike) and hides a write inside a plain
  `UPDATE`. The app's atomic operations are explicit functions for a reason
  (CLAUDE.md).
- **An `INSERT` grant plus an RLS check (`actor_id = auth.uid()`).** Keeps the
  functions as invoker functions, but any member could then forge events for
  their own household from the browser with one PostgREST call. This is the
  hole ADR 0007 closed for membership.
- **A `SECURITY DEFINER` helper that invoker functions call.** Does not work:
  `EXECUTE` is checked against the calling role, so the helper would have to
  be granted to `authenticated`, which is a direct write path again.
- **A full item-move history.** The right shape for a real audit trail, and
  it would show every move rather than the latest. Not needed at couple scale
  (ADR 0009 made the same call), and `activity_events` can carry it later by
  recording item moves too.
