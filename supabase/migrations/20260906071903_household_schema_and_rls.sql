-- Household schema + RLS
--
-- Creates the four tables a household's data lives in (households,
-- household_members, locations, items) and locks them down with row level
-- security so a household can only ever see/touch its own rows.
--
-- Deliberately NOT in this migration (see CLAUDE.md working agreement):
--   * the plpgsql RPC functions (move_item, move_container, delete_container,
--     redeem_invite) — those are a follow-up, Pair-mode task.
--   * any cross-row household-consistency enforcement (e.g. an item's
--     location_id belonging to the same household as the item, or a
--     location's parent_id staying within the same household). CLAUDE.md
--     assigns that class of invariant to the future move_item/move_container
--     RPCs ("under lock"), not to static schema.
--
-- Postgres 13+ ships gen_random_uuid() in core, so no extension is needed.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Composite primary key doubles as the "unique on (household_id, user_id)"
-- requirement — no surrogate id column, matching the settled schema exactly.
create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

-- Self-referencing so nesting can go arbitrarily deep (garage -> closet ->
-- toolbox -> red box). parent_id is ON DELETE RESTRICT: deleting a location
-- that still has children must go through the future delete_container RPC,
-- not fall out of a bare DELETE.
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  parent_id uuid references public.locations (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);

create index locations_household_id_idx on public.locations (household_id);
create index locations_parent_id_idx on public.locations (parent_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  name text not null,
  detail text,
  added_by uuid not null references auth.users (id),
  added_at timestamptz not null default now(),
  last_moved_by uuid references auth.users (id) on delete set null,
  last_moved_at timestamptz
);

create index items_household_id_idx on public.items (household_id);
create index items_location_id_idx on public.items (location_id);

-- ---------------------------------------------------------------------------
-- RLS helper
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so a policy on household_members that calls this doesn't
-- re-trigger RLS on household_members itself (which would either recurse or
-- simply see nothing, since the querying role's own RLS is what's still
-- being evaluated). This is a read-only predicate, not one of the four
-- excluded RPCs — it never mutates anything.
create function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS + grants
--
-- As of recent Supabase CLI defaults, new tables are NOT auto-exposed to
-- ANY PostgREST role — including service_role — without an explicit GRANT
-- (see supabase/config.toml's auto_expose_new_tables comment); RLS policies
-- alone aren't sufficient, and service_role's usual RLS bypass doesn't help
-- if it can't reach the table at all. authenticated gets table privileges
-- gated by the policies below; service_role gets them ungated (it bypasses
-- RLS by role attribute, needed for seeding/admin work such as the RLS
-- integration test and the future redeem_invite RPC); anon gets none.
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.locations enable row level security;
alter table public.items enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.households to authenticated, service_role;
grant select, insert, update, delete on public.household_members to authenticated, service_role;
grant select, insert, update, delete on public.locations to authenticated, service_role;
grant select, insert, update, delete on public.items to authenticated, service_role;

-- households: member-gated for select/update/delete. A second, narrower
-- policy allows INSERT for any authenticated user — a brand-new household
-- has no members yet, so "must already be a member" is unsatisfiable for
-- its own first row. Postgres OR's multiple permissive policies together,
-- so this only loosens INSERT; select/update/delete stay member-gated.
create policy households_member_access on public.households
  for all
  to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy households_insert_bootstrap on public.households
  for insert
  to authenticated
  with check (true);

-- household_members: gated on its own household_id. Note this means the
-- very first membership row for a freshly-created household (the founder
-- adding themselves) has no policy path here — deliberately not solved by
-- a matching bootstrap policy, since (unlike households) letting any
-- authenticated user insert arbitrary membership rows would be a real
-- privilege-escalation hole. CLAUDE.md already earmarks this exact shape of
-- problem for a privileged path (redeem_invite, run with the service-role
-- key "where the caller isn't yet a household member") — the founder case
-- needs the same treatment in a follow-up RPC/route-handler task.
create policy household_members_access on public.household_members
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy locations_access on public.locations
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy items_access on public.items
  for all
  to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
