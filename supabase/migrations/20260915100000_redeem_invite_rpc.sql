-- redeem_invite RPC — atomic invite redemption via SECURITY DEFINER
--
-- Closes the last of the four named write-with-invariants RPCs
-- (move_item, move_container, delete_container all already merged).
-- Depends on 20260914080000_invites_schema_and_rls.sql (the invites
-- table + RLS, schema only, no redeem_invite yet — this migration is
-- exactly the follow-up that one deferred).
--
-- SECURITY DEFINER, per the settled architecture ("service role is used
-- in exactly one place: redeem_invite"): the caller is NOT yet a member of
-- the invite's household when this function starts, so the plain
-- forwarded-JWT `authenticated` role can't see the household's own
-- invites row (invites_select requires is_household_member) and has no
-- UPDATE/DELETE grant on `invites` at all (confirmed absent by
-- supabase/tests/invites-rls.test.ts's own "members have no UPDATE or
-- DELETE grant at all" case) — both needed to redeem. SECURITY DEFINER
-- runs this function's body as its owner (the migration-applying role),
-- which owns the table and isn't subject to RLS or ordinary grants,
-- exactly the same mechanism create_household already uses for the
-- identical shape of problem ("the caller isn't a member of the thing
-- they're about to join yet"). This is the *only* function in this
-- migration — confirm no other function here inherits this privilege.
--
-- GRANT EXECUTE to authenticated only (not anon, not service_role): this
-- still requires a real logged-in caller, not anonymous redemption, and
-- is what actually determines the invocation role — SECURITY DEFINER
-- governs privilege *inside* the function body, not who's allowed to call
-- it in the first place.
--
-- Double-redemption behavior (documented per this task's own AC, which
-- asks for one explicit choice): AC #1's own exception list already
-- settles this for the invite code itself — "if none found, or
-- redeemed_at is already set, ... raises a clear RAISE EXCEPTION" — so a
-- second attempt at an ALREADY-consumed code is always rejected, no
-- matter who attempts it (even the original redeemer, even an existing
-- member). The only genuinely idempotent step is narrower: the
-- household_members INSERT alone, for the case where the invite is
-- still valid (unredeemed, unexpired) but the caller already happens to
-- be a member of that household — that INSERT is skipped, but the
-- invite is still consumed (redeemed_at/redeemed_by set) either way,
-- since AC #1 describes both writes as happening together on any valid
-- invite, with only the membership half called out as idempotent.
create function public.redeem_invite(p_code text)
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_result public.invites;
begin
  -- Defense in depth, checked first: the GRANT below already restricts
  -- EXECUTE to `authenticated`, so a plain anon-key call never reaches
  -- this body at all. This catches the narrower case of an
  -- `authenticated`-role call with no resolvable user.
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

  -- Idempotent: a caller who already belongs to this household (e.g. the
  -- invite's own creator, or a second member who joined some other way
  -- before anyone used this particular code) doesn't get a duplicate row
  -- or an error — household_members' composite PK on
  -- (household_id, user_id) is what a bare INSERT would otherwise
  -- violate, so this is checked explicitly rather than caught as a
  -- constraint-violation exception.
  if not exists (
    select 1
    from public.household_members
    where household_id = v_invite.household_id
      and user_id = auth.uid()
  ) then
    insert into public.household_members (household_id, user_id)
    values (v_invite.household_id, auth.uid());
    -- role defaults to 'member' (see household_members' own check
    -- constraint/default in 20260906071903_household_schema_and_rls.sql)
    -- — an invited joiner is never made 'owner' by redemption alone.
  end if;

  -- Re-checks redeemed_at IS NULL at the write itself, not just in the
  -- read above: two concurrent redemptions of the same code could both
  -- pass the check above before either commits (each .rpc() call is its
  -- own transaction), since a SELECT taken earlier in this function
  -- doesn't re-validate itself at UPDATE time. Without this, the second
  -- transaction's UPDATE would silently succeed after the first commits,
  -- overwriting redeemed_by and effectively letting the code be consumed
  -- twice. This is the same defense-in-depth shape move_item and
  -- delete_container already use for their own concurrent-write windows.
  update public.invites
  set redeemed_at = now(), redeemed_by = auth.uid()
  where id = v_invite.id
    and redeemed_at is null
  returning * into v_result;

  if not found then
    raise exception 'redeem_invite: invite was redeemed concurrently';
  end if;

  return v_result;
end;
$$;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
