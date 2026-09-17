-- locations: enforce parent_id/household_id consistency
--
-- Same gap items_location_household_trigger.sql closed for items, here for
-- locations' own self-referencing parent_id: locations_access's WITH CHECK
-- only confirms the caller belongs to the location's own household_id; it
-- has no way to also confirm a chosen parent_id belongs to that same
-- household, and Postgres FK checks only confirm the parent row exists
-- somewhere, not that it's the right household's.
--
-- Discovered wiring the Add-location flow's real insert: that task's own AC
-- assumed "RLS already rejects a parent from a different household" — the
-- exact same optimistic assumption items_location_household_trigger.sql's
-- own comment already documents being wrong, for the same structural
-- reason. Net effect before this trigger: a member of household A could
-- INSERT a location with household_id = A (satisfies RLS) and parent_id =
-- a real location belonging to household B — the write would succeed,
-- producing a location whose parent silently disagrees on household.
--
-- Not reachable through this app's own UI (add-location-form.tsx's
-- autocomplete only ever offers the caller's own household's locations as
-- parent options), but the same trigger-not-RLS reasoning items' trigger
-- used applies here: a BEFORE trigger is what can express "these two rows
-- must agree", which RLS predicates (evaluated one row in isolation)
-- can't. Fires on INSERT and on UPDATE of parent_id/household_id so a raw
-- PATCH bypassing move_container is caught too — move_container's own
-- UPDATE already checks cross-household explicitly before writing, so this
-- never rejects a legitimate move_container call.
--
-- Not SECURITY DEFINER: the parent-existence check below filters
-- explicitly by new.household_id (the same household_id locations_access's
-- own WITH CHECK already requires the caller to belong to), so RLS on
-- `locations` never hides a row this check needs to see — no elevated
-- privilege required, consistent with items_enforce_location_household,
-- delete_container, and move_item all also running as the calling user.
create function public.locations_enforce_parent_household()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.locations
    where id = new.parent_id
      and household_id = new.household_id
  ) then
    raise exception 'locations: parent_id must belong to the same household as the location (household_id)';
  end if;

  return new;
end;
$$;

create trigger locations_parent_household_consistency
before insert or update of parent_id, household_id on public.locations
for each row
execute function public.locations_enforce_parent_household();
