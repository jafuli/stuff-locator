-- Household limits before go-live (ADR 0015).
--
-- Nothing bounded a household's size: items, places, path depth, text
-- lengths and the activity log could all grow without limit, so the
-- database's worst case was unbounded. The free tier this goes live on has
-- a 500 MB budget and a target of 500 households, so every dimension gets a
-- cap here, at the database, where no client can get around it.
--
--   limit                      where it is enforced                     SQLSTATE
--   100 items per household    stash_item                               SL001
--   100 places per household   ensure_location_path, create_location    SL002
--   8 places per path          ensure_location_path, create_location,   SL003
--                              move_container
--   one household per user     create_household                         SL004
--   text lengths               CHECK constraints                        23514
--   newest 500 events kept     record_activity_event (prunes)           —
--
-- SL is a custom SQLSTATE class (implementation-defined classes may start
-- with a letter from I to Z), so the UI can map each limit to its own copy by
-- code instead of parsing messages. SL005 (household full) comes with
-- create_invite in the next migration. The numbers are mirrored for the UI
-- in src/lib/limits.ts; change both together.
--
-- Concurrency. The counting caps are checked under a lock on the household
-- row (SELECT … FOR UPDATE), so two stashes at 99 items can't both see 99
-- and both insert. Lock order is always the household row first, then
-- location rows (move_container); rename_location and delete_container never
-- take the household lock, so they can't form a cycle with it.
--
-- Existing data: text lengths are checked first and the migration stops
-- with a list if any row is too long. It never truncates. Households that
-- are already over a count or depth cap are only reported (RAISE NOTICE):
-- a cap applies to new writes, and nothing is taken away from anyone.

-- ---------------------------------------------------------------------------
-- 1. Text lengths: check what is there, then add the constraints
-- ---------------------------------------------------------------------------

do $$
declare
  v_total integer;
  v_sample text;
begin
  with too_long(tbl, id, len, max_len) as (
    select 'items.name', id::text, char_length(name), 80 from public.items where char_length(name) > 80
    union all
    select 'items.detail', id::text, char_length(detail), 500 from public.items where char_length(detail) > 500
    union all
    select 'locations.name', id::text, char_length(name), 60 from public.locations where char_length(name) > 60
    union all
    select 'households.name', id::text, char_length(name), 50 from public.households where char_length(name) > 50
    union all
    select 'profiles.display_name', user_id::text, char_length(display_name), 50
    from public.profiles where char_length(display_name) > 50
  ),
  numbered as (
    select *, row_number() over (order by tbl, id) as n from too_long
  )
  select count(*)::integer,
         string_agg(format('%s %s (%s > %s)', tbl, id, len, max_len), E'\n' order by n) filter (where n <= 25)
  into v_total, v_sample
  from numbered;

  if v_total > 0 then
    raise exception E'household_limits: % row(s) are longer than the new limits. Shorten them by hand (nothing is truncated automatically), or reset local dev data with `supabase db reset`, then re-run this migration. First rows:\n%',
      v_total, v_sample;
  end if;
end;
$$;

alter table public.items
  add constraint items_name_length check (char_length(name) <= 80),
  add constraint items_detail_length check (char_length(detail) <= 500);

alter table public.locations
  add constraint locations_name_length check (char_length(name) <= 60);

alter table public.households
  add constraint households_name_length check (char_length(name) <= 50);

alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 50);

-- The email's local part may be up to 64 characters, and handle_new_user
-- (an auth.users trigger) seeds the display name from it. Unclamped, a long
-- address would now fail the CHECK above and with it the whole sign-up.
-- The email itself is never touched.
create or replace function public.profile_display_name_for(p_email text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(left(trim(split_part(coalesce(p_email, ''), '@', 1)), 50)), ''),
    'Someone'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers — not granted to any Data API role
-- ---------------------------------------------------------------------------

-- The lock every counting cap is checked under.
create function public.lock_household(p_household_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform 1 from public.households where id = p_household_id for update;
end;
$$;

-- How many places a path to this place holds: 1 for a top-level place,
-- 0 for NULL (the top level itself).
create function public.location_depth(p_location_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  with recursive up(id, parent_id) as (
    select id, parent_id from public.locations where id = p_location_id
    union all
    select l.id, l.parent_id from public.locations l join up on l.id = up.parent_id
  )
  select count(*)::integer from up;
$$;

-- How many levels this place and everything inside it span: 1 for a place
-- with nothing inside, 0 for NULL.
create function public.location_subtree_height(p_location_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  with recursive down(id, level) as (
    select id, 1 from public.locations where id = p_location_id
    union all
    select l.id, down.level + 1 from public.locations l join down on l.parent_id = down.id
  )
  select coalesce(max(level), 0)::integer from down;
$$;

-- Place cap (100 per household). Call with the household row locked.
create function public.assert_place_capacity(p_household_id uuid, p_new_places integer)
returns void
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.locations where household_id = p_household_id) + p_new_places > 100 then
    raise exception 'place limit reached: a household holds at most 100 places'
      using errcode = 'SL002';
  end if;
end;
$$;

-- Depth cap (8 places per path).
create function public.assert_place_depth(p_depth integer)
returns void
language plpgsql
immutable
as $$
begin
  if p_depth > 8 then
    raise exception 'place depth limit reached: a path holds at most 8 places'
      using errcode = 'SL003';
  end if;
end;
$$;

revoke all on function public.lock_household(uuid) from public, anon, authenticated, service_role;
revoke all on function public.location_depth(uuid) from public, anon, authenticated, service_role;
revoke all on function public.location_subtree_height(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_place_capacity(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.assert_place_depth(integer) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. ensure_location_path — place cap and depth cap
-- ---------------------------------------------------------------------------

-- Covers stash_item, move_item with a new path and update_item. Unchanged
-- otherwise (see 20261015100000_unique_place_names_and_stash_item.sql).
-- The whole path is checked against the depth cap before anything is
-- created; the place cap is checked before each place that is actually
-- created, so reusing existing places never counts against it.
create or replace function public.ensure_location_path(p_household_id uuid, p_parent_id uuid, p_names text[])
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

  perform public.lock_household(p_household_id);
  perform public.assert_place_depth(public.location_depth(p_parent_id) + cardinality(p_names));

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
      perform public.assert_place_capacity(p_household_id, 1);

      insert into public.locations (household_id, parent_id, name)
      values (p_household_id, v_current, v_name)
      on conflict do nothing
      returning id into v_id;

      if v_id is null then
        -- Lost a race to a concurrent creator of the same place: it is
        -- committed now, so read it. (Every creator now holds the household
        -- lock, so this is belt and braces.)
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

-- ---------------------------------------------------------------------------
-- 4. stash_item — item cap
-- ---------------------------------------------------------------------------

-- Unchanged from 20261015110000_activity_events_and_locked_writes.sql apart
-- from the lock and the count. The item cap is checked before any new
-- places are created, so a refused stash leaves nothing behind (it would be
-- rolled back anyway).
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

  perform public.lock_household(v_household_id);

  if (select count(*) from public.items where household_id = v_household_id) >= 100 then
    raise exception 'stash_item: item limit reached: a household holds at most 100 items'
      using errcode = 'SL001';
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

-- ---------------------------------------------------------------------------
-- 5. create_location — the same two place caps
-- ---------------------------------------------------------------------------

-- "+ Add a place here" inserts directly rather than through
-- ensure_location_path (a duplicate must raise 23505 here, not be reused),
-- so it needs its own call to the same checks.
create or replace function public.create_location(p_name text, p_parent_id uuid default null)
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

  perform public.lock_household(v_household_id);
  perform public.assert_place_depth(public.location_depth(p_parent_id) + 1);
  perform public.assert_place_capacity(v_household_id, 1);

  insert into public.locations (household_id, parent_id, name)
  values (v_household_id, p_parent_id, v_name)
  returning * into v_created;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. move_container — a moved place can't push anything inside it past 8
-- ---------------------------------------------------------------------------

-- Unchanged from 20261015120000_move_container_default_top_level.sql apart
-- from the household lock (taken before any location row lock, to keep the
-- lock order) and the depth check: the new parent's depth plus the height
-- of the subtree being moved must stay within 8.
create or replace function public.move_container(p_location_id uuid, p_new_parent_id uuid default null)
returns public.locations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_location public.locations;
  v_new_parent_household_id uuid;
  v_updated public.locations;
begin
  if v_uid is null then
    raise exception 'move_container: authentication required';
  end if;

  select household_id into v_household_id
  from public.locations
  where id = p_location_id;

  if v_household_id is null or not public.is_household_member(v_household_id) then
    raise exception 'move_container: location not found or not accessible';
  end if;

  perform public.lock_household(v_household_id);

  select * into v_location
  from public.locations
  where id = p_location_id
  for update;

  if not found then
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

  perform public.assert_place_depth(
    public.location_depth(p_new_parent_id) + public.location_subtree_height(p_location_id)
  );

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

-- ---------------------------------------------------------------------------
-- 7. Activity retention — keep the newest 500 events per household
-- ---------------------------------------------------------------------------

-- Every writer goes through this helper, so pruning here covers them all,
-- in the same transaction as the event. The feed itself only ever shows
-- the newest 100 (ACTIVITY_FEED_LIMIT).
--
-- No household lock here: rename_location and delete_container lock a
-- location row before they get here, and move_container locks the household
-- before a location row, so locking the household in this helper could
-- deadlock. Without it, two writes committing at the same instant can each
-- prune to 500 before seeing the other's insert and leave 501 behind; the
-- next write trims it. ADR 0015.
create or replace function public.record_activity_event(
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

  delete from public.activity_events
  where id in (
    select id
    from public.activity_events
    where household_id = p_household_id
    order by created_at desc, id desc
    offset 500
  );
end;
$$;

-- Prune what is already there, once.
delete from public.activity_events
where id in (
  select id
  from (
    select id,
           row_number() over (partition by household_id order by created_at desc, id desc) as n
    from public.activity_events
  ) ranked
  where n > 500
);

-- ---------------------------------------------------------------------------
-- 8. create_household — one household per user
-- ---------------------------------------------------------------------------

-- Replaces the "multi-household membership is intentionally unrestricted"
-- rule of 20260908092921_create_household_rpc.sql. redeem_invite keeps its
-- ADR 0008 behaviour (joining removes the caller's empty solo household).
--
-- A transaction-scoped advisory lock on the caller serialises two
-- concurrent calls by the same user (two tabs finishing sign-up), so the
-- membership check can't pass twice. The second call gets SL004 and the
-- bootstrap service treats that as "already has one".
create or replace function public.create_household(p_name text)
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

  if p_name is null or p_name !~ '\S' then
    raise exception 'create_household: name must not be null, empty, or whitespace-only';
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

-- ---------------------------------------------------------------------------
-- 9. Report households that are already over a cap (they keep everything)
-- ---------------------------------------------------------------------------

do $$
declare
  v_row record;
begin
  for v_row in
    select h.id,
           (select count(*) from public.items i where i.household_id = h.id) as items,
           (select count(*) from public.locations l where l.household_id = h.id) as places,
           (select coalesce(max(public.location_depth(l.id)), 0) from public.locations l where l.household_id = h.id) as depth,
           (select count(*) from public.household_members m where m.household_id = h.id) as members
    from public.households h
  loop
    if v_row.items > 100 or v_row.places > 100 or v_row.depth > 8 or v_row.members > 2 then
      raise notice 'household_limits: household % is over a limit (items %, places %, depth %, members %)',
        v_row.id, v_row.items, v_row.places, v_row.depth, v_row.members;
    end if;
  end loop;
end;
$$;
