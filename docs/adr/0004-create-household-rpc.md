# 4. create_household RPC — household bootstrap

**Status:** Accepted

## Context

ADR 0003 shipped `households`/`household_members`/`locations`/`items` with
RLS that gates every operation — including INSERT — on
`is_household_member()`. That's correct for steady-state access, but it left
no path for a household to ever come into existence: a brand-new household
has no members yet, so "you must already be a member" is unsatisfiable for
its own first row. ADR 0003 also recorded that an earlier draft tried a
permissive bootstrap INSERT policy on `households` and reverted it —
PostgREST's `RETURNING` (what `supabase-js`'s `.insert().select()` sends) is
itself SELECT-policy-gated, so a non-member creator could insert a household
row but never read its id back, making that policy pure attack surface with
no matching benefit. ADR 0003 explicitly deferred the real fix to "a
privileged, atomic path" — this task builds that path, now that auth
(sign-up/sign-in/sign-out) is merged and real users exist who need
somewhere to land.

## Decisions

**`create_household(p_name text)` as a `SECURITY DEFINER` plpgsql function.**
Neither `households` nor `household_members` has `FORCE ROW LEVEL SECURITY`
set, so the function's owner (the migration-applying role, which owns both
tables) is exempt from RLS for the duration of the call — mirroring exactly
why `is_household_member()` is `SECURITY DEFINER`, just applied to writes
instead of a read. `set search_path = public` is pinned for the same reason
`is_household_member()` pins it: an unpinned `SECURITY DEFINER` function
resolves unqualified names using the *caller's* search_path, letting a
caller who can create objects in an earlier-resolving schema redirect the
function's table/function references to their own code, executed with the
function owner's elevated privileges. This is the standard mitigation for
that class of bug, not a new pattern.

**Validation order: authentication before name.** `GRANT EXECUTE ...  TO
authenticated` (below) already stops a plain anon-key call at the Postgres
permission layer (`42501`) before the function body runs at all. The
function's own `IF auth.uid() IS NULL` check is defense-in-depth for an
`authenticated`-role call with no resolvable user — checked first so a
caller who shouldn't be here never learns whether their name would
otherwise have been accepted. Both this check and the name check raise
distinct, `create_household: `-prefixed messages, so a failure is greppable
straight from an error log rather than surfacing as a generic constraint
violation.

**`p_name IS NULL OR trim(p_name) = ''`, not just `trim(p_name) = ''`.**
`trim(NULL)` evaluates to `NULL`, and `NULL = ''` is `NULL` (not `TRUE`)
under three-valued logic — the bare check would silently skip validation for
a `NULL` argument and let it fall through to an `INSERT` that fails on
`households.name`'s `NOT NULL` constraint instead, with a non-greppable
generic error.

**`RETURNS public.households` (a bare composite), not `SETOF`/`TABLE(...)`.**
PostgREST serializes a function that returns a single row of a composite
type as one JSON object; a set-returning declaration — even for exactly one
row — serializes as a one-element JSON array. The bare composite return is
what makes `supabase-js`'s `.rpc("create_household", ...)` resolve `data` to
`{id, name, created_at}` directly, matching what a caller creating one
household expects.

**No new INSERT/UPDATE/DELETE policy added to `households` or
`household_members`.** This RPC remains the sole path to create either kind
of row — restating, now with the actual fix in hand, why ADR 0003 rejected a
bootstrap INSERT policy: it can't satisfy PostgREST's `RETURNING` for a
non-member creator anyway, so it would only add attack surface.

**No restriction on multi-household membership.** The composite primary key
on `household_members` is `(household_id, user_id)`, not unique on
`user_id` alone — nothing in the settled schema or CLAUDE.md restricts a
user to one household, and this task doesn't add a restriction that wasn't
asked for. Calling `create_household` twice as the same user produces two
independent households, each with its own owner membership row.

**`create_household` is a new addition to CLAUDE.md's named RPC list**
(`move_item`, `move_container`, `delete_container`, `redeem_invite`), filling
the exact "household/first-member bootstrap" gap ADR 0003 already
anticipated needing a privileged RPC for, just not yet named there.

## Rejected

- **A permissive bootstrap INSERT policy on `households`.** Already rejected
  once in ADR 0003; restated here as still rejected now that the actual fix
  (this RPC) exists, for the same reason: `RETURNING` is SELECT-policy-gated,
  so such a policy can't let a non-member creator read the id back, and it
  becomes pure attack surface with no matching benefit.
- **`RETURNS SETOF public.households` / `RETURNS TABLE(...)`.** Both are
  set-returning and serialize as a JSON array via PostgREST even for a
  single row — a bare `RETURNS public.households` is required for the
  single-object response this RPC's callers expect.
- **Restricting a user to one household.** No requirement or existing
  constraint supports it, and CLAUDE.md's data model doesn't imply it —
  left open rather than guessed at.

## Consequences

- `src/lib/database.types.ts` regenerated (`npm run db:types` against a
  local `supabase start`) to include `create_household` under
  `public.Functions`.
- `supabase/tests/create-household-rpc.test.ts` (run via `npm run test:rls`,
  local-only, same as `rls-household-isolation.test.ts`) is the standing
  proof: success + membership readback through the caller's own client,
  empty/whitespace-name rejection with row-count assertions, anonymous-call
  rejection, and multi-household membership.
- One known, deliberate test-coverage gap: the function's own
  `auth.uid() IS NULL` defense-in-depth branch isn't independently
  reachable through `supabase-js` — the GRANT already stops anon calls
  before the function body runs, and constructing an `authenticated`-role
  call with no resolvable `sub` claim would require hand-crafting a JWT,
  which isn't worth the complexity for a defense-in-depth line that only
  matters if the GRANT is ever loosened.
- Still deferred, per `src/server/services/README.md`: `redeem_invite` (a
  separate future task for joining an *existing* household), a route
  handler/service wrapper for `create_household`, and any UI to call it —
  this PR ships only the database-layer primitive; the app continues to run
  on fixtures until a future task wires it up.
