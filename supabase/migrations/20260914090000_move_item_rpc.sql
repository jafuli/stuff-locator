-- move_item RPC — atomic item relocation with cross-household validation
--
-- Closes a gap the original Data layer migration explicitly deferred:
-- "cross-household referential consistency (items.location_id /
-- locations.parent_id not checked against household) is deferred to the
-- future move_item/move_container RPCs." This closes it for items;
-- move_container (a separate task) closes the equivalent gap for locations
-- and additionally needs cycle prevention, which doesn't apply here.
--
-- Unlike create_household, this function is NOT SECURITY DEFINER — it runs
-- as the calling user via the forwarded JWT, consistent with the settled
-- architecture (only redeem_invite uses the service role). Every select/
-- update below is subject to the caller's own RLS, so a caller who isn't a
-- member of the item's (or the destination location's) household simply
-- can't see the row here, same as querying it directly through PostgREST.
create function public.move_item(p_item_id uuid, p_new_location_id uuid)
returns public.items
language plpgsql
set search_path = public
as $$
declare
  v_item_household_id uuid;
  v_new_location_household_id uuid;
  v_updated public.items;
begin
  -- Defense in depth, checked first: the GRANT below already restricts
  -- EXECUTE to `authenticated`, so a plain anon-key call never reaches
  -- this body at all. This catches the narrower case of an
  -- `authenticated`-role call with no resolvable user.
  if auth.uid() is null then
    raise exception 'move_item: authentication required';
  end if;

  select household_id into v_item_household_id
  from public.items
  where id = p_item_id;

  if not found then
    raise exception 'move_item: item not found or not accessible';
  end if;

  select household_id into v_new_location_household_id
  from public.locations
  where id = p_new_location_id;

  if not found then
    raise exception 'move_item: destination location not found or not accessible';
  end if;

  -- RLS alone only confirms the caller can see each row in isolation — it
  -- never checks that the two rows agree with each other. A caller who
  -- happens to be a member of two households could otherwise move an item
  -- into a location that's genuinely visible to them but belongs to their
  -- OTHER household, silently breaking the item's own household scoping.
  -- That's the cross-row invariant RLS can't express, so it's checked
  -- here explicitly instead of relied on implicitly.
  if v_item_household_id <> v_new_location_household_id then
    raise exception 'move_item: item and destination location belong to different households';
  end if;

  -- added_by/added_at are untouched; last_moved_by/last_moved_at record
  -- this move. The household_id equality in the WHERE clause is a
  -- defense-in-depth backstop against the narrow window between the
  -- checks above and this write (e.g. a concurrent move_container
  -- reparenting the destination into a different household in between) —
  -- if that invariant stopped holding, this simply matches zero rows
  -- rather than writing something the checks above didn't actually verify.
  update public.items
  set location_id = p_new_location_id,
      last_moved_by = auth.uid(),
      last_moved_at = now()
  where id = p_item_id
    and household_id = v_new_location_household_id
  returning * into v_updated;

  if not found then
    raise exception 'move_item: item could not be updated (it may have changed concurrently)';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.move_item(uuid, uuid) from public, anon;
grant execute on function public.move_item(uuid, uuid) to authenticated;
