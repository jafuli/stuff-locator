# 7. `household_members` is read-only for signed-in users

**Status:** Accepted

## Context

`household_members` is the table that decides who may see and change a
household's data: `is_household_member()` reads it, and every other policy
leans on that. The first schema migration guarded it with a single
`for all` policy — "you may do anything to rows of a household you belong to".

That is circular in the wrong direction. Any member could, from the browser
with their own JWT, `insert` a membership row for an arbitrary user id into
their own household (adding someone with no invite) or `delete` their
partner's row (evicting them). The invite flow, which exists precisely to
control who joins, was bypassable with one PostgREST call.

Nothing legitimate used that power. Every membership write already runs inside
a `SECURITY DEFINER` function — `create_household` and `redeem_invite` — which
executes as the function owner and ignores the caller's grants and policies.
The app's own code only ever `select`s from the table.

## Decision

`authenticated` gets `SELECT` and nothing else on `household_members`:

- `revoke insert, update, delete` on the table from `authenticated`, so a write
  fails loudly with `42501 permission denied for table household_members`
  rather than being silently filtered to zero rows.
- Replace the `for all` policy with a `for select` one using the same
  `is_household_member(household_id)` predicate.

`service_role` keeps its grants; the integration tests seed memberships with it.

## Consequences

- A member can read their household's roster (the settings page needs both
  members) and nothing else about membership.
- Future features that change membership — leaving a household, removing a
  partner, switching households — must be new `SECURITY DEFINER` functions,
  each with its own checks. That is the intended friction: membership changes
  are security decisions, not CRUD.
- `supabase/tests/household-members-read-only.test.ts` proves the denial with
  real error codes and checks via the service role that the rows are untouched.

## Alternatives considered

- **Keep `for all`, add a `with check` on role.** Still lets a member add or
  evict anyone; it only constrains which role they hand out.
- **Policy only, no revoke.** Safe, but a denied write would be a silent
  zero-row success (see ADR 0005), which hides bugs.
