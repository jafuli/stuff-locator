-- delete_container RPC — reject deletion of a non-empty location
--
-- Closes the last unimplemented write-with-invariants named in the
-- settled architecture doc ("writes carrying invariants: move_item,
-- move_container, delete_container, redeem_invite go through route
-- handlers into plpgsql functions"). move_item is a separate, already-
-- opened PR not yet merged to main as of this branch; move_container and
-- redeem_invite are separate tasks too. This migration has no dependency
-- on any of them — it only needs the already-merged households/locations/
-- items schema.
--
-- Deliberate scope decision: this function only ever removes a genuinely
-- empty container — no cascade delete, no reassigning children/items to
-- the parent. Both are plausible future behaviors that haven't been
-- product-decided, so "delete a non-empty container" is left as an
-- explicit future task rather than guessed at here.
--
-- Unlike create_household, this function is NOT SECURITY DEFINER — it
-- runs as the calling user via the forwarded JWT, consistent with
-- move_item and the settled architecture. It relies on RLS for row
-- visibility.
--
-- Note that locations.parent_id and items.location_id are both already
-- `ON DELETE RESTRICT` (see 20260906071903_household_schema_and_rls.sql),
-- so a bare DELETE on a non-empty location would already fail — but only
-- with a generic Postgres foreign_key_violation, not the clear, greppable
-- message this function's own explicit pre-checks provide.
create function public.delete_container(p_location_id uuid)
returns public.locations
language plpgsql
set search_path = public
as $$
declare
  v_deleted public.locations;
begin
  -- Defense in depth, checked first: the GRANT below already restricts
  -- EXECUTE to `authenticated`, so a plain anon-key call never reaches
  -- this body at all. This catches the narrower case of an
  -- `authenticated`-role call with no resolvable user.
  if auth.uid() is null then
    raise exception 'delete_container: authentication required';
  end if;

  -- Confirms the location exists and is visible to the caller under RLS
  -- before anything else — a caller who isn't a member of its household
  -- simply can't see it here, same as querying it directly.
  perform 1 from public.locations where id = p_location_id;
  if not found then
    raise exception 'delete_container: location not found or not accessible';
  end if;

  if exists (select 1 from public.locations where parent_id = p_location_id) then
    raise exception 'delete_container: location has child locations and cannot be deleted';
  end if;

  if exists (select 1 from public.items where location_id = p_location_id) then
    raise exception 'delete_container: location has items and cannot be deleted';
  end if;

  delete from public.locations
  where id = p_location_id
  returning * into v_deleted;

  -- Defense in depth against the narrow window between the checks above
  -- and this delete — e.g. a concurrent caller deleting the same location
  -- first, so this DELETE matches zero rows rather than the one row the
  -- checks above just confirmed existed. (A concurrent insert of a new
  -- child location or item in that same window takes a different path:
  -- the FK's own ON DELETE RESTRICT rejects this DELETE outright with a
  -- foreign_key_violation, which is a real Postgres error either way —
  -- not a silent success — just not this particular branch.)
  if not found then
    raise exception 'delete_container: location could not be deleted (it may have changed concurrently)';
  end if;

  return v_deleted;
end;
$$;

revoke all on function public.delete_container(uuid) from public, anon;
grant execute on function public.delete_container(uuid) to authenticated;
