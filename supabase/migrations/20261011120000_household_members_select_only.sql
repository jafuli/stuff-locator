-- household_members: members may READ the roster, never write it.
--
-- The original schema gave authenticated a `for all` policy gated on
-- is_household_member(). That meant any member could, straight from the
-- browser with their own JWT:
--   - insert a membership row for any user id into their own household
--     (adding an arbitrary person without an invite), or
--   - delete their partner's row (locking them out of the household).
--
-- Nothing in the app needs that. Every membership write goes through a
-- SECURITY DEFINER function (create_household, redeem_invite), which runs as
-- the function owner and ignores both grants and policies. So tightening is
-- free: the app only ever SELECTs from this table as `authenticated`.
--
-- Two layers, deliberately (see ADR 0005): a privilege revoke, so a write is
-- refused loudly with 42501 instead of silently filtered to zero rows by RLS,
-- and a select-only policy, so the table stays safe even if a future grant
-- is added by mistake.

drop policy household_members_access on public.household_members;

create policy household_members_select on public.household_members
  for select
  to authenticated
  using (public.is_household_member(household_id));

revoke insert, update, delete on public.household_members from authenticated;
