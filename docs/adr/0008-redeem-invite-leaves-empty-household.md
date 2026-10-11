# 8. Redeeming an invite leaves the caller's empty household

**Status:** Accepted

## Context

Every account gets a personal household from the bootstrap route. The invite
flow avoids a second one for brand-new accounts by redeeming *before*
bootstrapping (`redeem-invite-then-bootstrap.test.ts`). It does nothing for
someone who already has an account: they signed up, bootstrapped, never stashed
anything, and later open their partner's `/join/<code>` link. After redeeming
they belong to two households, and Home picks the oldest membership — their
own empty one. The partner's link "worked" and showed nothing.

## Decision

At the end of `redeem_invite` (already `SECURITY DEFINER`), delete every other
household of the caller that is **only theirs and empty**: the caller is the
sole member, and there are no items and no locations. Households with data, or
with another member, are never touched.

The household row is locked `FOR UPDATE` before the emptiness check. Joining a
household inserts a `household_members` row, which takes a `FOR KEY SHARE` on
the household, so a partner joining that empty household at the same moment
and our delete serialise instead of racing.

Everything runs in the redeem transaction: a rejected redemption (unknown,
expired, already redeemed) deletes nothing.

## Consequences

- The common case — a user who has only ever had the auto-created household —
  ends in exactly one household, the shared one, with no UI.
- A user who joins with data in their own household still ends up in two, and
  Home still shows the older. That is the real multi-household problem; it is
  tracked as its own backlog item (several households per user with a
  switcher in settings) rather than half-solved here.
- Unredeemed invites of the deleted household go with it (cascade). They were
  only reachable by that one user.
- Two users, each alone in an empty household, redeeming into each other's
  at the same instant can deadlock; Postgres aborts one with `40P01` and a
  retry succeeds.

## Alternatives considered

- **Move the data instead.** Pointless: the household is empty by definition.
- **Delete from TypeScript after redeeming.** Two calls can't be atomic, and
  `household_members` is read-only for signed-in users (ADR 0007), so it would
  need privileges the app deliberately doesn't hold.
- **Ask the user.** An empty household has nothing to decide about.
