# 11. Activity events: one append-only log, written inside the functions

**Status:** Accepted. Supersedes ADR 0009.

## Context

ADR 0009 derived the Activity feed from items' own provenance columns
(`added_by`, `added_at`, `last_moved_by`, `last_moved_at`). That was cheap and
correct for what it showed, but it cannot express most of what the Locations
refactor makes possible:

- **Deletes.** A deleted item or place has no row left to carry a column.
- **Renames and edits.** The row holds only the *current* name or detail, so
  "who renamed it, and from what" is gone the moment it is overwritten.
- **Places at all.** `locations` has no provenance columns, and adding them
  would still not say who deleted one.
- **Moves.** The row keeps only the *latest* move, and not where the item came
  from. "My partner moved it and didn't tell me" is answered by "it's in the
  kitchen now", not by "it was in the hallway, now it's in the kitchen".

A feed that merges provenance-derived events with a second, event-table-backed
set would have two sources, two orderings and two ways to be wrong. Itamar's
call (2026-10-15) was one source: **every** event, item added and moved
included, comes from the same table.

The question the feed answers is still "what changed while I was away?", not
"show me the audit trail". But "my partner deleted the box and I don't know
what happened to it" is exactly the failure Catch up exists for.

## Decision

An append-only **`activity_events`** table is the single source for the
Activity feed. It records eight kinds:

| kind | written by |
|---|---|
| `item_added` | `stash_item` |
| `item_moved` | `move_item` (and `update_item`, when an edit changes the place) |
| `item_renamed` | `update_item` |
| `item_detail_changed` | `update_item` |
| `item_deleted` | `delete_item` |
| `place_renamed` | `rename_location` |
| `place_moved` | `move_container` |
| `place_deleted` | `delete_container` |

**Place creation is not an event.** A place is only ever made on the way to
something else (the item's `item_added` already carries the full path,
including any places it created) or by "+ Add a place here" in Browse, where
an empty place is not news to the partner. `create_location` writes no event.

**Shape:**

- `household_id`: scopes reads and RLS.
- `actor_id`: who did it. Resolved to a display name at read time through
  `profiles`; an unresolvable person shows as "Someone".
- `kind`: one of the eight values above, constrained.
- `subject_id`: the item or place the event is about. **No foreign key**: the
  subject is often deleted, and the event has to outlive it.
- `subject_name`, `from_text`, `to_text`, `detail_text`: text **snapshots** of
  the name and the full path (or detail) as they were at the time. Old events
  stay readable after later renames and moves ("deleted *Bottom drawer*, was
  in *Office › Cabinet*"). A move records `from_text` → `to_text`, so the feed
  can show where an item moved *from*.
- `created_at`.

An index on `(household_id, created_at desc)` serves the feed.

**Every move is kept.** An item moved three times is three events, each with
its own from → to.

**Written in the same transaction as the change**, inside the functions
above. If the change rolls back, so does its event; an event can't exist for
something that didn't happen. A no-op save (`update_item` with nothing
changed) writes nothing.

**Clients read through RLS and can't write events.** `authenticated` gets
`SELECT` and nothing else on `activity_events`, with a select policy on
`is_household_member(household_id)`. `service_role` keeps its grants for the
integration tests (ADR 0005). Events are therefore only ever appended by the
functions above, which are `SECURITY DEFINER` with `set search_path = public`
and an explicit `is_household_member` check, the same pattern ADR 0007
established for `household_members`.

**Direct writes to `items` and `locations` are locked.** `authenticated`
keeps `SELECT` on both tables and loses `INSERT`, `UPDATE` and `DELETE`
(ADR 0005 style: the revoke is named in the migration, not inherited). Every
write goes through a `SECURITY DEFINER` function: `stash_item`, `move_item`,
`update_item`, `delete_item`, `create_location`, `rename_location`,
`move_container` and `delete_container`. Without this, a direct
`supabase.from('items').update(...)` would change data and silently skip the
log, and the feed would be a convenient fiction.

**Provenance columns stay.** `added_by`, `added_at`, `last_moved_by` and
`last_moved_at` on `items` remain as a convenience copy for item detail
("added by Maayan, 3 weeks ago"), kept current by the same writers. The feed
does not read them.

**Backfill.** The migration that creates the table inserts one `item_added`
per existing item (actor `added_by`, at `added_at`, `to_text` the item's
current path) and, where `last_moved_at > added_at`, one `item_moved` with no
`from_text`. The data is dev/test only, but the feed must not start empty and
wrong. A move without a `from_text` renders as "to *path*".

## Consequences

- The feed gains deletes, renames, edits and every move, with readable old
  values, from one table and one ordering. The service layer stops merging.
- **Making the writers `SECURITY DEFINER` is a real change.** Today
  `move_item`, `move_container` and `delete_container` are invoker functions
  and lean on RLS for authorization. As definer functions they must
  re-implement that check themselves, which is where a missed check would
  become a cross-household write. Each needs the explicit membership test
  first, and the RLS integration tests (`npm run test:rls`) must prove a
  non-member and `anon` are refused. CLAUDE.md's "server-side clients forward
  the user's JWT so RLS still applies" is true for reads; it is not what
  protects these functions.
- `actor_id` must come from `auth.uid()` inside the function, never from a
  parameter, or the actor could be forged.
- Snapshots are denormalised on purpose. They cost a little storage and mean
  a place's path is stored as text in many rows; that is the point.
- The app can no longer write `items` or `locations` from the browser or a
  route handler with a plain query builder. That is the intent, but it means
  every future write path needs a function first.
- Provenance columns are now a second copy of facts the log also holds. If
  they drift, the log is right and the columns are wrong; the writers update
  both in one transaction to keep that from happening.

## Alternatives considered

- **Keep item added/moved derived from provenance (the earlier, partial
  version of this ADR).** Two sources and two orderings, and it cannot show
  an item's earlier moves or where it moved from. Rejected once the log
  existed anyway.
- **Provenance columns on `locations`** (`renamed_by`, `moved_by`, …). Follows
  ADR 0009's approach, but cannot express a delete, and keeps only the latest
  of each.
- **Postgres triggers on `items` and `locations`.** Would capture every write
  automatically, but a trigger has no access to the acting user's intent (a
  move and an unrelated update look alike) and hides a write inside a plain
  `UPDATE`. The app's atomic operations are explicit functions for a reason
  (CLAUDE.md).
- **Convention plus tests only, leaving direct writes open.** Cheaper, and
  every current call site would be correct. But a single direct write, today
  or in a later change, silently skips the log with no error anywhere. The
  lock turns "remember to use the function" into "the database refuses".
- **An `INSERT` grant plus an RLS check (`actor_id = auth.uid()`).** Keeps the
  functions as invoker functions, but any member could then forge events for
  their own household from the browser with one PostgREST call. This is the
  hole ADR 0007 closed for membership.
- **A `SECURITY DEFINER` helper that invoker functions call.** Does not work:
  `EXECUTE` is checked against the calling role, so the helper would have to
  be granted to `authenticated`, which is a direct write path again.
