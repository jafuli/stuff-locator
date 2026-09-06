# 3. Household schema + RLS foundations

**Status:** Accepted

## Context

CLAUDE.md settles the shape of the data model (`household → members`,
`household → items`, self-referencing `locations`) and the ownership rule
(everything scoped to a household, never to a `user_id`), but nothing had
been built yet — `supabase/migrations/` was empty, `src/lib/database.types.ts`
shipped as a hand-written placeholder. This task lands the first real
migration: the four tables and their RLS policies, deliberately **without**
the plpgsql RPCs (`move_item`, `move_container`, `delete_container`,
`redeem_invite`) — those stay a follow-up. A few implementation-level
decisions had to be made to make the RLS design actually work, which is what
this ADR records.

## Decisions

**A `SECURITY DEFINER` helper, `is_household_member(household_id)`, backs
every policy.** A policy on `household_members` that queries
`household_members` to check membership would otherwise re-evaluate RLS on
itself for that subquery — `SECURITY DEFINER` (with `search_path` pinned)
runs the check with the function owner's privileges instead, sidestepping the
self-reference. It's read-only and never mutates anything, so it isn't one of
the four excluded RPCs — it's plumbing the RLS design needs, not an atomic
write operation.

**`households` is member-gated for every operation, including INSERT — with
no bootstrap exception, and that's a correction, not the original design.**
An earlier draft added a second, permissive `FOR INSERT WITH CHECK (true)`
policy reasoning that a brand-new household has no members yet, so "must
already be a member" is unsatisfiable for its own first row. Self-review
caught that this policy was inert for any real client: PostgREST's
`RETURNING` (what `supabase-js`'s `.insert().select()` sends) is itself
gated by the SELECT policy, so a non-member creator could insert a household
row but never read its id back — the policy was pure attack surface (blind
inserts of arbitrary rows by any authenticated user) with no matching
benefit, and had zero test coverage in either direction. Removed.

**Explicit `GRANT`s to `authenticated`, none to `anon`.** Recent Supabase CLI
defaults (see the `auto_expose_new_tables` comment in `supabase/config.toml`)
stopped auto-exposing newly created tables to PostgREST roles — RLS policies
alone aren't sufficient without a table-level `GRANT` as well. Easy to miss
since older guides assume the legacy auto-expose behavior.

**Two invariants are deliberately left unenforced by schema, not forgotten:**
- No CHECK/trigger stops an item's `location_id` pointing at a location in a
  *different* household than the item, or a location's `parent_id` crossing
  households. CLAUDE.md assigns this class of invariant to the future
  `move_item`/`move_container` RPCs ("under lock"), not to static schema.
- Creating a household, and adding its first (founder) member, are the same
  shape of problem and neither has an RLS path — both require the creator to
  act before they're a member of anything. CLAUDE.md already earmarks this
  exact shape of problem for a privileged path (`redeem_invite`, run with the
  service-role key "where the caller isn't yet a household member") — a
  future RPC needs to create the household row and the founder's membership
  row together, atomically, under the service role, and hand the id back
  directly rather than relying on the client re-reading through PostgREST.
  Not solved here — RPCs are explicitly out of scope for this task.
- `items.added_by` is `not null` (an item always has a creator), so unlike
  `last_moved_by` it can't be `on delete set null` — it defaults to
  `on delete no action`, meaning deleting an `auth.users` row (account
  closure) fails with a FK violation for anyone who's ever added an item.
  Not contradicted by the settled schema, but account deletion will need an
  answer for this eventually.

## Rejected

- **A surrogate `id` column on `household_members`.** The AC's field list is
  `household_id, user_id, role, joined_at` with a uniqueness requirement on
  `(household_id, user_id)` — a composite primary key on those two columns
  satisfies that directly, with no extra column to keep in sync.
- **Repeating the membership subquery inline in every policy** instead of a
  helper function. Works fine for `locations`/`items`/`households` (they
  query a *different* table), but fails for `household_members`'s own policy
  via RLS self-recursion — one helper function used everywhere is simpler to
  reason about than "inline everywhere except this one table."
- **Solving the household/first-member bootstrap problem in this task.**
  Doing it properly needs a privileged, atomic path (create household +
  insert the founder's membership together) — exactly the shape of thing
  CLAUDE.md reserves for RPCs/route handlers, which are explicitly out of
  scope here. Flagging it precisely rather than guessing at a schema-only
  workaround.

## Consequences

- `src/lib/database.types.ts` is now machine-generated from the real schema
  (`npm run db:types` against a local `supabase start`) — the placeholder
  header comment is gone.
- `supabase/tests/rls-household-isolation.test.ts` (run via `npm run
  test:rls`, requires `supabase start`) is the standing proof that the
  policies actually isolate households, not just that they compile.
- The next data-layer task (the four RPCs) inherits two known, named gaps:
  cross-household referential consistency, and household/first-member
  bootstrap — both called out above rather than silently patched.
- A same-PR self-review pass caught the inert `households` bootstrap policy
  above by actually exercising it against a live local stack (`.insert()`
  followed by a read-back as the same non-member user) rather than trusting
  that "INSERT succeeds" meant "this works" — the shipped migration reflects
  the fix, not the original draft.
