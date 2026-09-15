-- items: enforce location_id/household_id consistency, and added_by
-- attribution, on write
--
-- Discovered while wiring the Stash flow to real writes: this task's own
-- Acceptance Criteria assumed "RLS already rejects a write where the
-- selected location doesn't belong to the caller's household" — but it
-- doesn't. `items_access`'s WITH CHECK only evaluates
-- is_household_member(household_id) against the ITEM's own household_id;
-- it has no way to also compare that against the referenced location's
-- household_id, and Postgres FK checks only confirm the location exists
-- somewhere, not that it's the right household's. move_item's own migration
-- comment says this outright: "RLS alone only confirms the caller can see
-- each row in isolation — it never checks that the two rows agree with
-- each other." move_item closes that gap for relocating an existing item;
-- nothing closed it for creating one, because there was no direct-insert
-- write path until this task.
--
-- Net effect before this trigger: an authenticated member of household A
-- could INSERT an item with household_id = A (satisfies RLS) and
-- location_id = a real location belonging to household B (a household ID
-- they can enumerate/guess, or belong to via a second membership) — the
-- write would succeed, producing a row whose location and household
-- silently disagree. Not reachable through this app's own UI (the
-- autocomplete only ever offers the caller's own household's locations),
-- but AC #2 explicitly requires it be unreachable at the data layer too,
-- "shouldn't happen through the UI, but must still be safe."
--
-- A second, related gap closed here after self-review: the client sends
-- added_by from its own signed-in session, but nothing stopped a member
-- from setting it to a *different* member's id (a raw request bypassing
-- the UI, same threat model as the location/household gap above) —
-- verified this actually succeeded before this trigger. Since "Catch up"
-- (the activity feed of who moved what) depends on added_by/last_moved_by
-- being trustworthy, this closes it the same way: the caller can only ever
-- attribute an item to themselves. Scoped to auth.uid() IS NOT NULL so
-- service-role seeding (existing tests in delete-container-rpc.test.ts,
-- move-item-rpc.test.ts, location-subtree-items-rpc.test.ts, and
-- rls-household-isolation.test.ts all insert items directly as
-- service_role, which has no auth.uid()) is unaffected — service_role
-- already bypasses RLS entirely by role attribute, so it's already fully
-- trusted, same reasoning CLAUDE.md applies everywhere else service_role
-- appears.
--
-- A trigger, not another RLS policy: RLS predicates evaluate one row in
-- isolation against the querying role's own visibility, which is exactly
-- what can't express "these two columns must agree" here (the same reason
-- move_item checks this in application/function logic rather than in a
-- policy). A BEFORE trigger is the least invasive way to add these
-- cross-row/cross-value checks to every write path (this task's direct
-- client insert, and defensively any future raw UPDATE of these columns)
-- without touching RLS itself or duplicating a check the client already
-- performs — the client only ever offers same-household locations and its
-- own id; this is the backstop for a request that didn't go through the
-- client.
--
-- Not SECURITY DEFINER: the location/household existence check below
-- filters explicitly by `new.household_id` (the same household_id
-- items_access's own WITH CHECK already requires the caller to belong to),
-- so RLS on `locations` never hides a row this check needs to see — no
-- elevated privilege required, consistent with delete_container and
-- move_item both also running as the calling user.
create function public.items_enforce_location_household()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.locations
    where id = new.location_id
      and household_id = new.household_id
  ) then
    raise exception 'items: location_id must belong to the same household as the item (household_id)';
  end if;

  -- added_by is only ever set at creation (there's no UPDATE path for it),
  -- so this only needs to run on INSERT. IS DISTINCT FROM (not <>) so a
  -- NULL added_by — which added_by's NOT NULL constraint already
  -- forbids — can't slip past a three-valued-logic NULL comparison either.
  if tg_op = 'INSERT' and auth.uid() is not null and new.added_by is distinct from auth.uid() then
    raise exception 'items: added_by must be the authenticated caller';
  end if;

  return new;
end;
$$;

-- Fires on INSERT (this task's new write path) and on any future UPDATE
-- that touches location_id/household_id (e.g. a raw PostgREST PATCH
-- bypassing move_item entirely) — cheap to include now, and move_item's
-- own UPDATE already keeps both columns consistent, so this never rejects
-- a legitimate move_item call.
create trigger items_location_household_consistency
before insert or update of location_id, household_id on public.items
for each row
execute function public.items_enforce_location_household();
