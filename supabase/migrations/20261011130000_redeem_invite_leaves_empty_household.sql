-- redeem_invite: after joining, leave any household the caller was left alone
-- in with nothing in it.
--
-- Why: every new account gets a personal household from the bootstrap route
-- (ensureHousehold -> create_household). The invite flow redeems BEFORE
-- bootstrapping, so a brand-new joiner never gets one — but someone who
-- already has an account (signs in via /join/<code>, or bootstrapped first)
-- ends up in two households, and Home shows the oldest one: their own empty
-- one, not their partner's. See ADR 0008.
--
-- Rule: delete a household other than the invite's if and only if
--   - the caller is a member, and
--   - the caller is its ONLY member, and
--   - it has no items and no locations.
-- Anything with data in it is left alone (the user decides what to do; true
-- multi-household support is a separate backlog item).
--
-- Concurrency: a partner could be joining that empty household at this very
-- moment. Joining inserts a household_members row, which takes a FOR KEY
-- SHARE lock on the households row; we take FOR UPDATE on it before the
-- emptiness check, so the two serialise and the check sees the committed
-- truth. (Two empty-household owners redeeming into each other at once can
-- deadlock; Postgres aborts one with 40P01 and the caller can retry.)
--
-- Deleting a household cascades to its members and invites — fine, because
-- by the rule above the only member is the caller.
--
-- Everything else in this function is unchanged from
-- 20260915100000_redeem_invite_rpc.sql, which documents the SECURITY DEFINER
-- and double-redemption reasoning. Grants survive CREATE OR REPLACE.
create or replace function public.redeem_invite(p_code text)
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_result public.invites;
  v_other_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'redeem_invite: authentication required';
  end if;

  select * into v_invite from public.invites where code = p_code;
  if not found then
    raise exception 'redeem_invite: invite not found';
  end if;

  if v_invite.redeemed_at is not null then
    raise exception 'redeem_invite: invite already redeemed';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'redeem_invite: invite expired';
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_invite.household_id, auth.uid())
  on conflict (household_id, user_id) do nothing;

  update public.invites
  set redeemed_at = now(), redeemed_by = auth.uid()
  where id = v_invite.id
    and redeemed_at is null
  returning * into v_result;

  if not found then
    raise exception 'redeem_invite: invite was redeemed concurrently';
  end if;

  -- Fixed lock order (by id) keeps two cleanups from locking in opposite
  -- orders.
  for v_other_household_id in
    select m.household_id
    from public.household_members m
    where m.user_id = auth.uid()
      and m.household_id <> v_invite.household_id
    order by m.household_id
  loop
    perform 1 from public.households where id = v_other_household_id for update;
    if not found then
      continue; -- already deleted by a concurrent transaction
    end if;

    if not exists (
         select 1 from public.household_members
         where household_id = v_other_household_id and user_id <> auth.uid()
       )
       and not exists (
         select 1 from public.items where household_id = v_other_household_id
       )
       and not exists (
         select 1 from public.locations where household_id = v_other_household_id
       )
    then
      delete from public.households where id = v_other_household_id;
    end if;
  end loop;

  return v_result;
end;
$$;
