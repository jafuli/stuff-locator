-- A household's name is only what someone typed; the default title is
-- composed when it is shown.
--
-- households.name was NOT NULL from the first schema, so every household got
-- a generated name at creation: the founder's email handle, and briefly
-- "<First>'s household". Both are copies of the founder's display name taken
-- on one day. They go stale the moment that person renames themselves, and
-- they put UI copy ("'s household") into data.
--
-- From here on:
--   - name is NULL unless someone chose it (the Settings rename, later);
--   - the app shows the name when there is one, else "<owner's first
--     name>'s household", resolved from the owner's profile at read time
--     like every other display name (src/lib/household-title.ts);
--   - create_household's name is optional. Leaving it out (or passing NULL)
--     creates an unnamed household; a name that is given must still have
--     something in it.
--
-- The 50-character CHECK (ADR 0015) stays: it only ever applies to a typed
-- name now. CHECK constraints pass on NULL.

alter table public.households alter column name drop not null;

-- Every existing name becomes NULL. No screen has ever let anyone choose a
-- household name: the only writer was the sign-up bootstrap, passing the
-- founder's email handle (or "<First>'s household", or "Our household"). So
-- every name in the table is generated, and matching them against the
-- owner's *current* name would miss exactly the stale ones (an owner who
-- has renamed themselves since).
update public.households set name = null where name is not null;

-- Same body as 20261124115842_household_limits.sql, except the name check:
-- NULL now means "no name"; only a given-but-blank name is refused.
-- Adding a default keeps the signature create_household(text), so the
-- existing grants (execute to authenticated only) carry over unchanged.
create or replace function public.create_household(p_name text default null)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households;
begin
  if auth.uid() is null then
    raise exception 'create_household: authentication required';
  end if;

  if p_name is not null and p_name !~ '\S' then
    raise exception 'create_household: name must not be empty or whitespace-only';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create_household:' || auth.uid()::text, 0));

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'create_household: the caller already belongs to a household'
      using errcode = 'SL004';
  end if;

  insert into public.households (name)
  values (trim(p_name))
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, auth.uid(), 'owner');

  return v_household;
end;
$$;
