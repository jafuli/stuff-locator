-- Locations 6/7 — move_container: an omitted parent means "top level".
--
-- Moving a place to the top level was always possible (pass NULL), but the
-- generated TypeScript types derive an argument's optionality from its SQL
-- default, so `p_new_parent_id: null` was a type error and the Move dialog's
-- "Top level" button had to cast around it. Giving the parameter a default
-- makes "no parent" expressible, and typed, by omitting it.
--
-- Body is otherwise identical to the 3/7 version (same checks, same
-- messages, same event); only the signature gains `default null`.

create or replace function public.move_container(p_location_id uuid, p_new_parent_id uuid default null)
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
