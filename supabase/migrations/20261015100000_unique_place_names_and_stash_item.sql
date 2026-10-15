-- Locations 2/7 — unique place names + atomic stash_item.
--
-- Fixes a reproduced bug: typing the same place name in two separate Stash
-- steps created two top-level locations with that name. Two causes, both
-- closed here at the database (ADR 0010):
--   (a) `locations` had no uniqueness rule;
--   (b) the app inserted the location and then the item as two calls, so a
--       retry after a failed item insert created the location again.
--
-- What this migration does:
--   1. names are normalized (trimmed, internal whitespace collapsed, empty
--      rejected) by a trigger, and guaranteed by a CHECK constraint;
--   2. a unique index makes a name unique per parent, ignoring case;
--   3. `ensure_location_path` — the one place-creation path capture uses —
--      finds each level case-insensitively or creates it, race-safe;
--   4. `stash_item` creates any missing places and the item in one
--      transaction;
--   5. `move_item` grows an optional `p_new_path` so an item edit that moves
--      the item somewhere brand-new is atomic too.
--
-- SECURITY DEFINER, and why (this deviates from the task's wording — see the
-- PR): `stash_item` and `move_item` call `ensure_location_path`, which must
-- NOT be callable by clients. A plain (invoker) function runs as
-- `authenticated`, and EXECUTE on a function is checked against the calling
-- role, so an invoker `stash_item` could only call `ensure_location_path` if
-- `authenticated` held EXECUTE on it — i.e. clients could call it directly,
-- which ADR 0010 rules out. Making the two callers SECURITY DEFINER lets the
-- helper stay ungranted. They therefore carry their own explicit
-- `is_household_member` checks instead of leaning on RLS (the ADR 0007 / 0011
-- pattern), and take `added_by` / `last_moved_by` from `auth.uid()`, never a
-- parameter.
--
-- Existing data: the migration fails loudly, with an instructive message,
-- if any household already has two places that collide under the new rule.
-- Existing rows are dev/test data; merging them is not this migration's job.

-- ---------------------------------------------------------------------------
-- 1. Name normalization
-- ---------------------------------------------------------------------------

create function public.normalize_place_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
$$;

-- The CHECK constraint and the trigger below evaluate this function as the
-- role doing the write (authenticated, or service_role in tests), so those
-- roles need EXECUTE on it. It is a pure text function that touches no table,
-- so exposing it is harmless — unlike ensure_location_path, which writes.
-- anon never writes places and gets nothing (ADR 0005: grants are named).
revoke all on function public.normalize_place_name(text) from public, anon;
grant execute on function public.normalize_place_name(text) to authenticated, service_role;

create function public.locations_normalize_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := public.normalize_place_name(new.name);

  if new.name = '' then
    raise exception 'locations: a place name must not be empty'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger locations_normalize_name
before insert or update of name on public.locations
for each row
execute function public.locations_normalize_name();

-- Normalize what is already there, then fail loudly on anything the new
-- rule can't accept.
update public.locations
set name = public.normalize_place_name(name)
where name <> public.normalize_place_name(name);

do $$
declare
  v_collisions integer;
begin
  select count(*) into v_collisions
  from (
    select 1
    from public.locations
    group by household_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)
    having count(*) > 1
  ) as collisions;

  if v_collisions > 0 then
    raise exception
      'locations: % group(s) of places share a name under the same parent (ignoring case). '
      'Merge or rename them by hand, or reset local dev data with `supabase db reset`, then re-run this migration.',
      v_collisions;
  end if;
end;
$$;

alter table public.locations
  add constraint locations_name_normalized
  check (name <> '' and name = public.normalize_place_name(name));

-- ---------------------------------------------------------------------------
-- 2. Unique per parent, ignoring case
-- ---------------------------------------------------------------------------

-- coalesce(parent_id, nil uuid) so top-level places (parent_id IS NULL)
-- collide with each other too: a plain unique index treats NULLs as
-- distinct. The same name under different parents stays allowed.
create unique index locations_unique_name_per_parent
  on public.locations (
    household_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- ---------------------------------------------------------------------------
-- 3. ensure_location_path — internal, not granted to any client role
-- ---------------------------------------------------------------------------

-- Walks p_names under p_parent_id (NULL = top level), reusing each level's
-- case-insensitive sibling match or creating it, and returns the id of the
-- last level (p_parent_id itself when p_names is empty).
--
-- Race-safe: the insert is ON CONFLICT DO NOTHING against the unique index
-- above, and a lost race re-reads the winner's row.
--
-- It does NOT authorize the caller — it has no idea who that is. Callers are
-- SECURITY DEFINER functions that have already proven membership of
-- p_household_id. What it does check is that p_parent_id belongs to
-- p_household_id, so a path can never be grafted onto another household.
create function public.ensure_location_path(p_household_id uuid, p_parent_id uuid, p_names text[])
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_current uuid := p_parent_id;
  v_raw text;
  v_name text;
  v_id uuid;
begin
  if p_household_id is null then
    raise exception 'ensure_location_path: household is required';
  end if;

  if p_parent_id is not null and not exists (
    select 1
    from public.locations
    where id = p_parent_id
      and household_id = p_household_id
  ) then
    raise exception 'ensure_location_path: parent place not found in this household';
  end if;

  if p_names is null or cardinality(p_names) = 0 then
    return p_parent_id;
  end if;

  foreach v_raw in array p_names loop
    v_name := public.normalize_place_name(v_raw);

    if v_name = '' then
      raise exception 'ensure_location_path: a place name must not be empty'
        using errcode = '23514';
    end if;

    select id into v_id
    from public.locations
    where household_id = p_household_id
      and parent_id is not distinct from v_current
      and lower(name) = lower(v_name);

    if v_id is null then
      insert into public.locations (household_id, parent_id, name)
      values (p_household_id, v_current, v_name)
      on conflict do nothing
      returning id into v_id;

      if v_id is null then
        -- Lost a race to a concurrent creator of the same place: it is
        -- committed now, so read it.
        select id into v_id
        from public.locations
        where household_id = p_household_id
          and parent_id is not distinct from v_current
          and lower(name) = lower(v_name);
      end if;
    end if;

    v_current := v_id;
    v_id := null;
  end loop;

  return v_current;
end;
$$;

revoke all on function public.ensure_location_path(uuid, uuid, text[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. stash_item — the item and any new places, in one transaction
-- ---------------------------------------------------------------------------

-- p_location_id : an existing place to put the item in, or — when
--                 p_new_path is non-empty — the parent the new path hangs
--                 off (NULL = top level).
-- p_new_path    : place names to find-or-create, outermost first.
-- At least one of the two must be given.
--
-- With no p_location_id the household is the caller's oldest membership,
-- the same rule Home and Browse use.
create function public.stash_item(
  p_name text,
  p_detail text default null,
  p_location_id uuid default null,
  p_new_path text[] default '{}'
)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_path text[] := coalesce(p_new_path, '{}');
  v_target uuid;
  v_item public.items;
begin
  if v_uid is null then
    raise exception 'stash_item: authentication required';
  end if;

  if v_name = '' then
    raise exception 'stash_item: the item name must not be empty'
      using errcode = '23514';
  end if;

  if p_location_id is null and cardinality(v_path) = 0 then
    raise exception 'stash_item: a location or a new place path is required';
  end if;

  if p_location_id is not null then
    select household_id into v_household_id
    from public.locations
    where id = p_location_id;

    -- One message for "no such place" and "not your household's": the
    -- caller learns nothing about places they can't see.
    if v_household_id is null or not public.is_household_member(v_household_id) then
      raise exception 'stash_item: location not found or not accessible';
    end if;
  else
    select household_id into v_household_id
    from public.household_members
    where user_id = v_uid
    order by joined_at asc
    limit 1;

    if v_household_id is null then
      raise exception 'stash_item: caller is not a member of any household';
    end if;
  end if;

  v_target := public.ensure_location_path(v_household_id, p_location_id, v_path);

  insert into public.items (household_id, location_id, name, detail, added_by)
  values (v_household_id, v_target, v_name, v_detail, v_uid)
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.stash_item(text, text, uuid, text[]) from public, anon;
grant execute on function public.stash_item(text, text, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. move_item — optional new path, still one transaction
-- ---------------------------------------------------------------------------

-- Replaces move_item(uuid, uuid). A new signature needs a DROP: CREATE OR
-- REPLACE would add an overload and leave PostgREST unable to pick one.
-- Existing callers (move_item(p_item_id, p_new_location_id)) keep working:
-- both new parameters have defaults.
--
-- Now SECURITY DEFINER (see the header): the membership checks that RLS used
-- to do implicitly are explicit below, with the same error messages the
-- invoker version produced.
drop function public.move_item(uuid, uuid);

create function public.move_item(
  p_item_id uuid,
  p_new_location_id uuid default null,
  p_new_path text[] default '{}'
)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item_household_id uuid;
  v_destination_household_id uuid;
  v_path text[] := coalesce(p_new_path, '{}');
  v_target uuid;
  v_updated public.items;
begin
  if v_uid is null then
    raise exception 'move_item: authentication required';
  end if;

  select household_id into v_item_household_id
  from public.items
  where id = p_item_id;

  if v_item_household_id is null or not public.is_household_member(v_item_household_id) then
    raise exception 'move_item: item not found or not accessible';
  end if;

  if p_new_location_id is null and cardinality(v_path) = 0 then
    raise exception 'move_item: a destination location or a new place path is required';
  end if;

  if p_new_location_id is not null then
    select household_id into v_destination_household_id
    from public.locations
    where id = p_new_location_id;

    if v_destination_household_id is null or not public.is_household_member(v_destination_household_id) then
      raise exception 'move_item: destination location not found or not accessible';
    end if;

    -- Membership of both households is not agreement between them: a caller
    -- in two households could otherwise move an item into the other one's
    -- place. A cross-row invariant RLS can't express.
    if v_item_household_id <> v_destination_household_id then
      raise exception 'move_item: item and destination location belong to different households';
    end if;
  end if;

  v_target := public.ensure_location_path(v_item_household_id, p_new_location_id, v_path);

  update public.items
  set location_id = v_target,
      last_moved_by = v_uid,
      last_moved_at = now()
  where id = p_item_id
    and household_id = v_item_household_id
  returning * into v_updated;

  if not found then
    raise exception 'move_item: item could not be updated (it may have changed concurrently)';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.move_item(uuid, uuid, text[]) from public, anon;
grant execute on function public.move_item(uuid, uuid, text[]) to authenticated;
