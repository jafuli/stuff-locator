-- create_household RPC
--
-- Bootstraps a brand-new household: atomically inserts the households row
-- and its founder's household_members row (role = 'owner'), then returns
-- the new household. This is the privileged path
-- 20260906071903_household_schema_and_rls.sql (see its households policy
-- comment) and ADR 0003 both flagged as missing — households and
-- household_members are member-gated for every operation, including
-- INSERT, so a bare authenticated client can never satisfy "must already
-- be a member" for a household that doesn't have any members yet.
--
-- SECURITY DEFINER runs this function's body with its owner's privileges
-- (the migration-applying role, which owns both tables) rather than the
-- calling role's — neither table has FORCE ROW LEVEL SECURITY set, and
-- FORCE is precisely what would make RLS apply even to a table's owner.
-- Without FORCE, the owning role is exempt from RLS by definition, so both
-- inserts below succeed regardless of whether the *caller* would pass
-- households_member_access / household_members_access. This mirrors
-- exactly why is_household_member() (in the earlier migration) is
-- SECURITY DEFINER, just for writes instead of a read.
--
-- No new INSERT policy was added to either table to cover this instead —
-- this function remains the sole path for creating a household, matching
-- the reasoning already recorded for why a permissive bootstrap INSERT
-- policy on households was tried and rejected: PostgREST's RETURNING is
-- itself SELECT-policy-gated, so such a policy alone can't let a
-- non-member creator read the id back anyway, making it pure attack
-- surface (blind inserts of arbitrary household rows) with no matching
-- benefit.
--
-- Multi-household membership is intentionally unrestricted: the composite
-- primary key on household_members is (household_id, user_id), not unique
-- on user_id alone, so calling this twice as the same user simply produces
-- two independent households, each with its own owner membership row.
create function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households;
begin
  -- Defense in depth, checked before the name: the GRANT/REVOKE below
  -- already restrict EXECUTE to the `authenticated` role, so a plain
  -- anon-key call never reaches this body at all — Postgres itself raises
  -- 42501 (permission denied for function) first. This check exists for
  -- what the GRANT alone can't catch: a call made in the `authenticated`
  -- role without a resolvable user (auth.uid() is null). Checking this
  -- before the name means an unauthorized caller never learns whether
  -- their input would otherwise have been accepted.
  if auth.uid() is null then
    raise exception 'create_household: authentication required';
  end if;

  -- Two things to get right here, in order:
  --   1. `p_name is null` must be its own explicit branch. `trim(NULL)` is
  --      NULL, and `NULL = ''` is NULL (not TRUE) under three-valued
  --      logic, so a bare `trim(p_name) = ''` check would silently skip
  --      validation for a NULL argument and fall through to an INSERT
  --      that fails on households.name's NOT NULL constraint instead of
  --      this function's own clear, greppable message.
  --   2. The blank check itself has to catch *all* whitespace, not just
  --      spaces. SQL's trim()/btrim() only strip the literal space
  --      character by default — a name of a single tab or newline would
  --      survive `trim(p_name) = ''` untouched and get inserted, which is
  --      exactly the "whitespace-only" case this is meant to reject.
  --      `p_name !~ '\S'` ("contains no non-whitespace character") is
  --      true for '', all-spaces, all-tabs, or any mix — the correct,
  --      general check. (Postgres regex extension: \S is a
  --      Tcl-ARE-not-POSIX-ERE escape, but is supported here.)
  if p_name is null or p_name !~ '\S' then
    raise exception 'create_household: name must not be null, empty, or whitespace-only';
  end if;

  -- A single PostgREST request runs as one transaction; if the second
  -- insert below fails for any reason, Postgres aborts and rolls back the
  -- whole transaction — including the household row this insert just
  -- created. No explicit rollback/exception-handling logic is needed (or
  -- wanted — catching the error here would suppress that rollback).
  --
  -- trim(p_name) here only strips leading/trailing plain spaces (per the
  -- validation above, p_name is already known to contain at least one
  -- non-whitespace character) — any leading/trailing tabs or newlines
  -- around real content are preserved rather than stripped, which is a
  -- minor cosmetic gap, not a validation hole.
  insert into public.households (name)
  values (trim(p_name))
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, auth.uid(), 'owner');

  return v_household;
end;
$$;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;
