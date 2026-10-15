-- Locations 3/7 — activity_events data layer, every writer, direct writes locked.
--
-- ADR 0011. One append-only log is the single source for the Activity feed:
-- item added / moved / renamed / detail edited / deleted and place renamed /
-- moved / deleted. Place creation is not an event.
--
-- This migration:
--   1. creates `activity_events` (RLS: members read, nobody writes directly);
--   2. adds two internal helpers (path text, event insert), ungranted;
--   3. adds the writers `update_item`, `delete_item`, `create_location`,
--      `rename_location` and replaces `stash_item`, `move_item`,
--      `move_container`, `delete_container` so each writes its event in the
--      SAME transaction as the change;
--   4. revokes INSERT/UPDATE/DELETE on `items` and `locations` from
--      `authenticated` — every write now goes through a function, so the log
--      can't be bypassed;
--   5. backfills one event per existing item (dev data; kept correct).
--
-- Every writer is SECURITY DEFINER with `set search_path = public` and an
-- explicit `is_household_member` check (the ADR 0007 / 0011 pattern). The
-- actor is `auth.uid()` inside the function, never a parameter.
--
-- Column usage by kind (the feed in 4/7 reads exactly this):
--
--   kind                 subject_name   from_text              to_text              detail_text
--   item_added           item name      —                      item's full path     item detail
--   item_moved           item name      old full path (NULL    new full path        —
--                                       for a backfilled move)
--   item_renamed         NEW name       old name               new name             —
--   item_detail_changed  item name      old detail (or NULL)   —                    new detail (NULL = removed)
--   item_deleted         item name      full path it was in    —                    —
--   place_renamed        NEW name       old full path          new name             —
--   place_moved          place name     old PARENT path        new PARENT path      —
--                                       (NULL = top level)     (NULL = top level)
--   place_deleted        place name     PARENT path it was in  —                    —
--                                       (NULL = top level)
--
-- Paths are text snapshots joined with ' › ', taken at the time of the event,
-- so old events stay readable after later renames and moves.

-- ---------------------------------------------------------------------------
-- 0. Tidy from 2/7: a trigger function needs no EXECUTE grant to fire.
-- ---------------------------------------------------------------------------

revoke all on function public.locations_normalize_name() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. activity_events
-- ---------------------------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Who did it. SET NULL rather than blocking account deletion: the feed
  -- shows an unresolvable actor as "Someone".
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (
    kind in (
      'item_added',
      'item_moved',
      'item_renamed',
      'item_detail_changed',
      'item_deleted',
      'place_renamed',
      'place_moved',
      'place_deleted'
    )
  ),
  -- The item or place the event is about. NO foreign key: the subject is
  -- often deleted, and the event has to outlive it.
  subject_id uuid not null,
  subject_name text not null,
  from_text text,
  to_text text,
  detail_text text,
  created_at timestamptz not null default now()
);

create index activity_events_household_created_idx
  on public.activity_events (household_id, created_at desc);

alter table public.activity_events enable row level security;

-- Supabase's default privileges would otherwise hand every Data API role
-- full access to a new table (ADR 0005): clear it, then name what's granted.
revoke all on public.activity_events from anon, authenticated, service_role;
grant select on public.activity_events to authenticated, service_role;

create policy activity_events_select on public.activity_events
  for select
  to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- 2. Internal helpers — not granted to any Data API role
-- ---------------------------------------------------------------------------

-- 'Office › Cabinet › Top drawer' for a place id; NULL for NULL / unknown.
create function public.location_path_text(p_location_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  with recursive up(id, parent_id, name, depth) as (
    select id, parent_id, name, 0
    from public.locations
    where id = p_location_id
    union all
    select l.id, l.parent_id, l.name, up.depth + 1
    from public.locations l
    join up on l.id = up.parent_id
  )
  select string_agg(name, ' › ' order by depth desc) from up;
$$;

revoke all on function public.location_path_text(uuid) from public, anon, authenticated, service_role;

-- The only thing that inserts into activity_events. The actor is taken from
-- the JWT here so no caller can forge one. clock_timestamp() (not now()) so
-- several events from one save keep their insertion order.
create function public.record_activity_event(
  p_household_id uuid,
  p_kind text,
  p_subject_id uuid,
  p_subject_name text,
  p_from_text text default null,
  p_to_text text default null,
  p_detail_text text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.activity_events (
    household_id, actor_id, kind, subject_id, subject_name, from_text, to_text, detail_text, created_at
  )
  values (
    p_household_id, auth.uid(), p_kind, p_subject_id, p_subject_name, p_from_text, p_to_text, p_detail_text,
    clock_timestamp()
  );
end;
$$;

revoke all on function public.record_activity_event(uuid, text, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3a. stash_item — now also writes item_added
-- ---------------------------------------------------------------------------

create or replace function public.stash_item(
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

  perform public.record_activity_event(
    v_household_id, 'item_added', v_item.id, v_item.name,
    null, public.location_path_text(v_target), v_item.detail
  );

  return v_item;
end;
$$;

revoke all on function public.stash_item(text, text, uuid, text[]) from public, anon;
grant execute on function public.stash_item(text, text, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. move_item — now also writes item_moved (from → to)
-- ---------------------------------------------------------------------------

-- Moving an item to the place it is already in is a no-op: the row is
-- returned unchanged, last_moved_* is not touched and no event is written.
create or replace function public.move_item(
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
  v_item public.items;
  v_destination_household_id uuid;
  v_path text[] := coalesce(p_new_path, '{}');
  v_target uuid;
  v_updated public.items;
begin
  if v_uid is null then
    raise exception 'move_item: authentication required';
  end if;

  select * into v_item
  from public.items
  where id = p_item_id;

  if not found or not public.is_household_member(v_item.household_id) then
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

    if v_item.household_id <> v_destination_household_id then
      raise exception 'move_item: item and destination location belong to different households';
    end if;
  end if;

  v_target := public.ensure_location_path(v_item.household_id, p_new_location_id, v_path);

  if v_target = v_item.location_id then
    return v_item;
  end if;

  update public.items
  set location_id = v_target,
      last_moved_by = v_uid,
      last_moved_at = now()
  where id = p_item_id
    and household_id = v_item.household_id
  returning * into v_updated;

  if not found then
    raise exception 'move_item: item could not be updated (it may have changed concurrently)';
  end if;

  perform public.record_activity_event(
    v_item.household_id, 'item_moved', v_item.id, v_item.name,
    public.location_path_text(v_item.location_id), public.location_path_text(v_target)
  );

  return v_updated;
end;
$$;

revoke all on function public.move_item(uuid, uuid, text[]) from public, anon;
grant execute on function public.move_item(uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3c. update_item — one atomic item-edit save
-- ---------------------------------------------------------------------------

-- A full save of the edit form: p_name (required), p_detail (blank or omitted
-- clears it) and the place. The place is p_location_id (an existing place, or
-- the parent p_new_path hangs off) and/or p_new_path (places to find-or-create);
-- give neither and the item stays where it is.
--
-- Writes item_renamed / item_detail_changed / item_moved only for what
-- actually changed. A save that changes nothing returns the row and writes
-- nothing.
create function public.update_item(
  p_item_id uuid,
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
  v_item public.items;
  v_name text := btrim(coalesce(p_name, ''));
  v_detail text := nullif(btrim(coalesce(p_detail, '')), '');
  v_old_detail text;
  v_path text[] := coalesce(p_new_path, '{}');
  v_destination_household_id uuid;
  v_target uuid;
  v_renamed boolean;
  v_detail_changed boolean;
  v_moved boolean;
  v_updated public.items;
begin
  if v_uid is null then
    raise exception 'update_item: authentication required';
  end if;

  select * into v_item
  from public.items
  where id = p_item_id
  for update;

  if not found or not public.is_household_member(v_item.household_id) then
    raise exception 'update_item: item not found or not accessible';
  end if;

  if v_name = '' then
    raise exception 'update_item: the item name must not be empty'
      using errcode = '23514';
  end if;

  if p_location_id is null and cardinality(v_path) = 0 then
    v_target := v_item.location_id;
  else
    if p_location_id is not null then
      select household_id into v_destination_household_id
      from public.locations
      where id = p_location_id;

      if v_destination_household_id is null or not public.is_household_member(v_destination_household_id) then
        raise exception 'update_item: destination location not found or not accessible';
      end if;

      if v_item.household_id <> v_destination_household_id then
        raise exception 'update_item: item and destination location belong to different households';
      end if;
    end if;

    v_target := public.ensure_location_path(v_item.household_id, p_location_id, v_path);
  end if;

  -- Compare against a normalized old detail so a legacy '' vs NULL is not
  -- reported as an edit.
  v_old_detail := nullif(btrim(coalesce(v_item.detail, '')), '');
  v_renamed := v_name <> v_item.name;
  v_detail_changed := v_detail is distinct from v_old_detail;
  v_moved := v_target <> v_item.location_id;

  if not (v_renamed or v_detail_changed or v_moved) then
    return v_item;
  end if;

  update public.items
  set name = v_name,
      detail = v_detail,
      location_id = v_target,
      last_moved_by = case when v_moved then v_uid else last_moved_by end,
      last_moved_at = case when v_moved then now() else last_moved_at end
  where id = p_item_id
  returning * into v_updated;

  if v_renamed then
    perform public.record_activity_event(
      v_item.household_id, 'item_renamed', v_item.id, v_name, v_item.name, v_name
    );
  end if;

  if v_detail_changed then
    perform public.record_activity_event(
      v_item.household_id, 'item_detail_changed', v_item.id, v_name, v_old_detail, null, v_detail
    );
  end if;

  if v_moved then
    perform public.record_activity_event(
      v_item.household_id, 'item_moved', v_item.id, v_name,
      public.location_path_text(v_item.location_id), public.location_path_text(v_target)
    );
  end if;

  return v_updated;
end;
$$;

revoke all on function public.update_item(uuid, text, text, uuid, text[]) from public, anon;
grant execute on function public.update_item(uuid, text, text, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3d. delete_item
-- ---------------------------------------------------------------------------

create function public.delete_item(p_item_id uuid)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item public.items;
  v_path text;
begin
  if v_uid is null then
    raise exception 'delete_item: authentication required';
  end if;

  select * into v_item
  from public.items
  where id = p_item_id
  for update;

  if not found or not public.is_household_member(v_item.household_id) then
    raise exception 'delete_item: item not found or not accessible';
  end if;

  v_path := public.location_path_text(v_item.location_id);

  delete from public.items where id = p_item_id;

  perform public.record_activity_event(
    v_item.household_id, 'item_deleted', v_item.id, v_item.name, v_path
  );

  return v_item;
end;
$$;

revoke all on function public.delete_item(uuid) from public, anon;
grant execute on function public.delete_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3e. create_location — no event (place creation is not news)
-- ---------------------------------------------------------------------------

-- The "+ Add a place here" write. Unlike ensure_location_path it does NOT
-- reuse a same-named sibling: a duplicate raises the unique violation (23505)
-- so the UI can say "You already have 'X' here." With no parent the household
-- is the caller's oldest membership, the same rule as stash_item.
create function public.create_location(p_name text, p_parent_id uuid default null)
returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_name text := public.normalize_place_name(p_name);
  v_created public.locations;
begin
  if v_uid is null then
    raise exception 'create_location: authentication required';
  end if;

  if v_name = '' then
    raise exception 'create_location: a place name must not be empty'
      using errcode = '23514';
  end if;

  if p_parent_id is not null then
    select household_id into v_household_id
    from public.locations
    where id = p_parent_id;

    if v_household_id is null or not public.is_household_member(v_household_id) then
      raise exception 'create_location: parent place not found or not accessible';
    end if;
  else
    select household_id into v_household_id
    from public.household_members
    where user_id = v_uid
    order by joined_at asc
    limit 1;

    if v_household_id is null then
      raise exception 'create_location: caller is not a member of any household';
    end if;
  end if;

  insert into public.locations (household_id, parent_id, name)
  values (v_household_id, p_parent_id, v_name)
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.create_location(text, uuid) from public, anon;
grant execute on function public.create_location(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3f. rename_location
-- ---------------------------------------------------------------------------

-- Normalizes the name; a duplicate sibling raises 23505 from the unique
-- index. Renaming to the identical name is a no-op (no event); a change of
-- case only ("office" → "Office") is a real rename.
create function public.rename_location(p_location_id uuid, p_name text)
returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_location public.locations;
  v_name text := public.normalize_place_name(p_name);
  v_old_path text;
  v_updated public.locations;
begin
  if v_uid is null then
    raise exception 'rename_location: authentication required';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
  for update;

  if not found or not public.is_household_member(v_location.household_id) then
    raise exception 'rename_location: location not found or not accessible';
  end if;

  if v_name = '' then
    raise exception 'rename_location: a place name must not be empty'
      using errcode = '23514';
  end if;

  if v_name = v_location.name then
    return v_location;
  end if;

  v_old_path := public.location_path_text(p_location_id);

  update public.locations
  set name = v_name
  where id = p_location_id
  returning * into v_updated;

  perform public.record_activity_event(
    v_location.household_id, 'place_renamed', v_location.id, v_updated.name, v_old_path, v_updated.name
  );

  return v_updated;
end;
$$;

revoke all on function public.rename_location(uuid, text) from public, anon;
grant execute on function public.rename_location(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3g. move_container — now SECURITY DEFINER, writes place_moved
-- ---------------------------------------------------------------------------

-- Same checks and messages as before (cycle prevention under lock included);
-- RLS used to do the membership part implicitly, so it is explicit now.
-- Moving a place to the parent it already has is a no-op (no event).
create or replace function public.move_container(p_location_id uuid, p_new_parent_id uuid)
returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_location public.locations;
  v_new_parent_household_id uuid;
  v_updated public.locations;
begin
  if v_uid is null then
    raise exception 'move_container: authentication required';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
  for update;

  if not found or not public.is_household_member(v_location.household_id) then
    raise exception 'move_container: location not found or not accessible';
  end if;

  if p_new_parent_id is not null then
    if p_new_parent_id = p_location_id then
      raise exception 'move_container: cannot move a location under itself';
    end if;

    select household_id into v_new_parent_household_id
    from public.locations
    where id = p_new_parent_id
    for update;

    if not found or not public.is_household_member(v_new_parent_household_id) then
      raise exception 'move_container: new parent location not found or not accessible';
    end if;

    if v_location.household_id <> v_new_parent_household_id then
      raise exception 'move_container: location and new parent belong to different households';
    end if;

    if exists (
      with recursive descendants(id) as (
        select id from public.locations where parent_id = p_location_id
        union all
        select l.id
        from public.locations l
        join descendants d on l.parent_id = d.id
      )
      select 1 from descendants where id = p_new_parent_id
    ) then
      raise exception 'move_container: cannot move a location under its own descendant';
    end if;
  end if;

  if p_new_parent_id is not distinct from v_location.parent_id then
    return v_location;
  end if;

  update public.locations
  set parent_id = p_new_parent_id
  where id = p_location_id
  returning * into v_updated;

  if not found then
    raise exception 'move_container: location could not be updated (it may have changed concurrently)';
  end if;

  perform public.record_activity_event(
    v_location.household_id, 'place_moved', v_location.id, v_location.name,
    public.location_path_text(v_location.parent_id), public.location_path_text(p_new_parent_id)
  );

  return v_updated;
end;
$$;

revoke all on function public.move_container(uuid, uuid) from public, anon;
grant execute on function public.move_container(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3h. delete_container — now SECURITY DEFINER, writes place_deleted
-- ---------------------------------------------------------------------------

-- Still BLOCKED while the place has child places or items (decided for v1).
create or replace function public.delete_container(p_location_id uuid)
returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_location public.locations;
  v_parent_path text;
  v_deleted public.locations;
begin
  if v_uid is null then
    raise exception 'delete_container: authentication required';
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
  for update;

  if not found or not public.is_household_member(v_location.household_id) then
    raise exception 'delete_container: location not found or not accessible';
  end if;

  if exists (select 1 from public.locations where parent_id = p_location_id) then
    raise exception 'delete_container: location has child locations and cannot be deleted';
  end if;

  if exists (select 1 from public.items where location_id = p_location_id) then
    raise exception 'delete_container: location has items and cannot be deleted';
  end if;

  v_parent_path := public.location_path_text(v_location.parent_id);

  delete from public.locations
  where id = p_location_id
  returning * into v_deleted;

  if not found then
    raise exception 'delete_container: location could not be deleted (it may have changed concurrently)';
  end if;

  perform public.record_activity_event(
    v_location.household_id, 'place_deleted', v_location.id, v_location.name, v_parent_path
  );

  return v_deleted;
end;
$$;

revoke all on function public.delete_container(uuid) from public, anon;
grant execute on function public.delete_container(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lock direct writes on items and locations
-- ---------------------------------------------------------------------------

-- authenticated keeps SELECT and loses INSERT / UPDATE / DELETE. The "for
-- all" policies are replaced with select-only ones so the policy set says
-- what the grants say (same shape as ADR 0007's household_members).
-- service_role keeps its grants: the integration tests seed and clean up
-- through it (ADR 0005).
revoke insert, update, delete on public.items from authenticated;
revoke insert, update, delete on public.locations from authenticated;

drop policy items_access on public.items;
drop policy locations_access on public.locations;

create policy items_select on public.items
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy locations_select on public.locations
  for select
  to authenticated
  using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- 5. Backfill — one item_added per item, plus one item_moved where the item
--    has been moved since (no from_text: the earlier place isn't recorded).
-- ---------------------------------------------------------------------------

insert into public.activity_events (
  household_id, actor_id, kind, subject_id, subject_name, from_text, to_text, detail_text, created_at
)
select i.household_id,
       i.added_by,
       'item_added',
       i.id,
       i.name,
       null,
       public.location_path_text(i.location_id),
       i.detail,
       i.added_at
from public.items i;

insert into public.activity_events (
  household_id, actor_id, kind, subject_id, subject_name, from_text, to_text, detail_text, created_at
)
select i.household_id,
       i.last_moved_by,
       'item_moved',
       i.id,
       i.name,
       null,
       public.location_path_text(i.location_id),
       null,
       i.last_moved_at
from public.items i
where i.last_moved_at is not null
  and i.last_moved_at > i.added_at;
