-- Invites: one function creates them, and a household is a couple (ADR 0015).
--
-- Until now the invite page read the household's unredeemed invites and, if
-- none was reusable, inserted one directly (authenticated held INSERT on
-- invites). Two loads at once could each find nothing and each insert, and
-- nothing stopped a third person joining a household. This migration:
--
--   1. adds create_invite(): SECURITY DEFINER, checks membership, locks the
--      household row, and returns the household's live invite or creates one;
--   2. revokes INSERT on invites from authenticated (SELECT stays), so
--      create_invite is the only way to make one;
--   3. makes both ends couple-only: create_invite refuses a household that
--      already has two members, and redeem_invite refuses to add a third,
--      under the same household lock. Both raise SQLSTATE SL005.
--
-- Code format (12 hex characters) and expiry (NULL = never) are unchanged.

-- ---------------------------------------------------------------------------
-- 1. create_invite
-- ---------------------------------------------------------------------------

-- "Live" = not redeemed and not expired. With the household row locked, two
-- concurrent calls serialise: the second one finds the first one's invite.
-- The household is the caller's oldest membership, the same rule every
-- page uses.
create function public.create_invite()
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_invite public.invites;
begin
  if v_uid is null then
    raise exception 'create_invite: authentication required';
  end if;

  select household_id into v_household_id
  from public.household_members
  where user_id = v_uid
  order by joined_at asc
  limit 1;

  if v_household_id is null then
    raise exception 'create_invite: caller is not a member of any household';
  end if;

  perform public.lock_household(v_household_id);

  if (select count(*) from public.household_members where household_id = v_household_id) >= 2 then
    raise exception 'create_invite: household full: a household has at most 2 members'
      using errcode = 'SL005';
  end if;

  select * into v_invite
  from public.invites
  where household_id = v_household_id
    and redeemed_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if found then
    return v_invite;
  end if;

  insert into public.invites (household_id, created_by)
  values (v_household_id, v_uid)
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. No direct inserts
-- ---------------------------------------------------------------------------

revoke insert on public.invites from authenticated;
drop policy invites_insert on public.invites;

-- ---------------------------------------------------------------------------
-- 3. redeem_invite — refuse a third member
-- ---------------------------------------------------------------------------

-- Unchanged from 20261011130000_redeem_invite_leaves_empty_household.sql
-- apart from the lock and the count. The invite's household is locked
-- together with the caller's other households, all in id order, before
-- anything is written: create_invite's member count and this one can't
-- interleave, and the order is the one the ADR 0008 cleanup loop already
-- uses. A caller who is already a member passes (the existing idempotent
-- case), so only a genuinely new third person is refused.
create or replace function public.redeem_invite(p_code text)
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_result public.invites;
  v_household_id uuid;
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

  for v_household_id in
    select v_invite.household_id
    union
    select m.household_id from public.household_members m where m.user_id = auth.uid()
    order by 1
  loop
    perform public.lock_household(v_household_id);
  end loop;

  -- A concurrent redemption of this same code may have committed while we
  -- waited for the lock: say so, rather than reporting the household full.
  select * into v_invite from public.invites where id = v_invite.id;
  if v_invite.redeemed_at is not null then
    raise exception 'redeem_invite: invite was redeemed concurrently';
  end if;

  if not exists (
       select 1 from public.household_members
       where household_id = v_invite.household_id and user_id = auth.uid()
     )
     and (select count(*) from public.household_members where household_id = v_invite.household_id) >= 2
  then
    raise exception 'redeem_invite: household full: a household has at most 2 members'
      using errcode = 'SL005';
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
