# 15. Household limits and the capacity target

**Status:** Accepted (2026-11-24). Amends ADR 0004, 0010 and 0011.

## Context

The app goes live on Supabase Free (500 MB database) and Vercel Hobby. The
design target, set on 2026-11-17, is **500 active households** (about 1,000
users) on those tiers.

Until now nothing bounded a household's size. Items, places, path depth,
every text field and the activity log could all grow without limit, so the
worst case for the database was unbounded: one household pasting a novel
into a detail field, or a script moving one item back and forth, could use
the budget meant for everyone. The app is for ~20–50 hard-to-find things per
household (CLAUDE.md), so limits well above real use cost nobody anything.

## Decision

### The limits

| Limit | Value | Enforced in | SQLSTATE |
|---|---|---|---|
| Items per household | 100 | `stash_item` | `SL001` |
| Places per household | 100 | `ensure_location_path`, `create_location` | `SL002` |
| Places per path (depth) | 8 | `ensure_location_path`, `create_location`, `move_container` | `SL003` |
| Households per user | 1 | `create_household` | `SL004` |
| Members per household | 2 | `create_invite`, `redeem_invite` | `SL005` |
| Item name / detail | 80 / 500 characters | CHECK constraints | `23514` |
| Place name | 60 characters | CHECK constraint | `23514` |
| Household name / display name | 50 / 50 characters | CHECK constraints | `23514` |
| Activity events kept per household | newest 500 | `record_activity_event` | — |

The place cap was 200 until 2026-11-24. Itamar: a household doesn't need more
places than things.

### How they are enforced

- **At the database, inside the existing write functions.** Every write to
  `items` and `locations` already goes through a `SECURITY DEFINER` function
  (ADR 0011), so the caps live there and no client can skip them. The UI
  mirrors the numbers in `src/lib/limits.ts` to warn early. The database
  stays the authority.
- **Counting caps are checked under a lock on the household row**
  (`SELECT … FOR UPDATE`, via the internal `lock_household`). Without it, two
  stashes at 99 items would each count 99 and both insert. Lock order is
  always the household row first, then location rows. `rename_location` and
  `delete_container` don't take the household lock, so they can't form a
  cycle with it.
- **`create_location` gets its own checks.** "+ Add a place here" inserts
  directly rather than through `ensure_location_path`, because a duplicate
  must raise `23505` there, not be reused. So the place and depth checks are
  shared helpers (`assert_place_capacity`, `assert_place_depth`) that both
  call.
- **Depth is checked for whole subtrees on a move.** `move_container`
  refuses a move when the new parent's depth plus the height of the moved
  subtree would pass 8.
- **One SQLSTATE per limit, in a custom class `SL`.** Implementation-defined
  SQLSTATE classes may start with a letter from I to Z. The UI maps the code
  to copy, the same way it maps `23505`, instead of parsing messages. Length
  overruns stay `23514`: every input carries a matching `maxLength`, so the
  database only sees them from a client that bypassed the form.
- **Existing data is checked, never truncated.** The migration stops with a
  list if any row is longer than a new limit. A household already over a
  count cap is only reported (`RAISE NOTICE`): caps apply to new writes.
- **Names derived from an email are clamped to 50.** The `auth.users`
  trigger seeds a display name from the email's local part, which can be 64
  characters. Unclamped, the new CHECK would fail the whole sign-up. The
  same applies to the household name the bootstrap derives.
- **Retention prunes inside `record_activity_event`**, the one function every
  writer already calls, in the same transaction. It takes no household lock,
  because that would deadlock against `rename_location`. So two writes
  committing at the same instant can briefly leave 501 events; the next
  write trims them.
- **One household per user.** `create_household` takes a per-user advisory
  lock and refuses a caller who already belongs to a household.
  `redeem_invite` keeps ADR 0008's behaviour: joining removes the caller's
  empty solo household, and a household with data in it is kept.

### Capacity: estimates and measurements

The estimates come from the schema (2026-11-17, at a 200-place cap). The
measurements come from `npm run measure:db` on local Supabase; see the next
section.

| Quantity | Estimate | Measured |
|---|---|---|
| Item row, typical / maxed | ~280 B / ~800 B | _pending_ |
| Place row, typical / maxed | ~250 B / ~350 B | _pending_ |
| Event row, typical / maxed | ~270 B / ~1.3 KB | _pending_ |
| Typical household (30 items, 15 places, ~150 events) | ~60 KB | _pending_ |
| Maxed-out household | ~780 KB (200 places) | _pending_ |

**Upgrade triggers** (2026-11-17): database over 300 MB, or Vercel function
invocations over 70% of quota. Then move to Supabase Pro + Vercel Pro.

## Consequences

- The database's worst case is now bounded: about 500 × the maxed-out
  household, plus Supabase's own baseline.
- Every counting write in a household is serialised on one row lock. For a
  two-person household that costs nothing measurable.
- The UI has a fixed set of codes to map, and one helper
  (`limitStatus`) decides "near" and "reached" for every counter.
- A partner joining a full household, or someone trying to make a second
  household, gets a specific refusal instead of quiet growth.
- The production baseline (`select pg_database_size(current_database())`
  right after the first `supabase db push`) is a manual step. It tells us
  how much of the 500 MB is ours.

## Alternatives considered

- **Caps in the route handlers or the client.** Simpler to show, but any
  direct RPC call would get past them. The write functions are already the
  only path, so the database is the right place.
- **Counting without a lock (or a `SERIALIZABLE` retry loop).** Without a
  lock the cap leaks under concurrency. `SERIALIZABLE` would close it, but
  pushes retries into every caller. One row lock per household is cheaper
  and local.
- **A trigger on `items` / `locations` for the caps.** It would catch every
  insert, but it fires per row inside `ensure_location_path`'s loop and
  can't see the whole path up front. The functions already know what they
  are about to do.
- **Retention by age (e.g. 90 days).** It doesn't bound a household that
  churns fast, and the feed's question is "what changed lately", which a
  count answers as well.
- **Truncating over-long rows in the migration.** That would silently change
  someone's data. A listed failure lets a person decide.
