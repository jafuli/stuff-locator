-- move_container RPC — relocate a location subtree with cycle and
-- cross-household prevention
--
-- Closes the same cross-household referential-consistency gap move_item
-- closed for items, but for locations — and additionally must prevent
-- cycles in the parent_id self-reference tree, a risk unique to
-- containers, not items. CLAUDE.md's Location model section names this
-- exact requirement: "Cycle prevention on move (a container can't be
-- placed inside its own descendant) is server-side, under lock."
--
-- Unlike create_household, this function is NOT SECURITY DEFINER — it
-- runs as the calling user via the forwarded JWT, consistent with
-- move_item and the settled architecture. It relies on RLS for row
-- visibility. "Under lock" here means `SELECT ... FOR UPDATE` on both the
-- location being moved and its prospective new parent, taken before the
-- cycle-detection CTE runs — this serializes concurrent movers of either
-- row for the rest of the transaction, closing the window a plain SELECT
-- would leave between "we confirmed no cycle" and "we wrote the change."
create function public.move_container(p_location_id uuid, p_new_parent_id uuid)
returns public.locations
language plpgsql
set search_path = public
as $$
declare
  v_location_household_id uuid;
  v_new_parent_household_id uuid;
  v_updated public.locations;
begin
  -- Defense in depth, checked first: the GRANT below already restricts
  -- EXECUTE to `authenticated`, so a plain anon-key call never reaches
  -- this body at all. This catches the narrower case of an
  -- `authenticated`-role call with no resolvable user.
  if auth.uid() is null then
    raise exception 'move_container: authentication required';
  end if;

  select household_id into v_location_household_id
  from public.locations
  where id = p_location_id
  for update;

  if not found then
    raise exception 'move_container: location not found or not accessible';
  end if;

  -- p_new_parent_id may be NULL to promote the location to the top level
  -- (locations.parent_id is nullable) — that's a valid, unchecked case:
  -- there's no household or cycle to validate against nothing.
  if p_new_parent_id is not null then
    if p_new_parent_id = p_location_id then
      raise exception 'move_container: cannot move a location under itself';
    end if;

    select household_id into v_new_parent_household_id
    from public.locations
    where id = p_new_parent_id
    for update;

    if not found then
      raise exception 'move_container: new parent location not found or not accessible';
    end if;

    -- RLS alone only confirms the caller can see each row in isolation —
    -- it never checks that the two rows agree with each other. Explicit
    -- cross-row check, the same shape as move_item's.
    if v_location_household_id <> v_new_parent_household_id then
      raise exception 'move_container: location and new parent belong to different households';
    end if;

    -- Cycle prevention: reject if the proposed new parent is anywhere in
    -- p_location_id's own current subtree. Walked with a recursive CTE
    -- BEFORE any write — RLS-gated like every other query here, but by
    -- this point both endpoints are already confirmed to be in the same
    -- household, so that adds no further narrowing.
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

  -- Only parent_id changes. Children's own parent_id values are untouched
  -- (they already point at p_location_id, which doesn't change), so the
  -- whole subtree moves implicitly along with its root.
  update public.locations
  set parent_id = p_new_parent_id
  where id = p_location_id
  returning * into v_updated;

  if not found then
    raise exception 'move_container: location could not be updated (it may have changed concurrently)';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.move_container(uuid, uuid) from public, anon;
grant execute on function public.move_container(uuid, uuid) to authenticated;
