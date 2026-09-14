-- Invites table + RLS (schema only — no redeem_invite RPC yet)
--
-- Adds a single new table, `invites`, on top of the existing
-- households/household_members/locations/items schema
-- (20260906071903_household_schema_and_rls.sql). No changes to those four
-- tables.
--
-- Deliberately NOT in this migration:
--   * the redeem_invite plpgsql function itself — redemption (marking an
--     invite redeemed and adding the redeemer, who isn't yet a household
--     member, as a member) needs the service-role key per CLAUDE.md
--     ("service role is used in exactly one place: redeem_invite") and is a
--     separate, future task.
--   * any invite-code expiry/rotation logic beyond the placeholder default
--     below — the code column just needs to be real and unique for now;
--     format/collision handling can be revisited when redeem_invite lands.
--   * any route handler or frontend — no invite UI exists anywhere in the
--     app yet.

-- pgcrypto provides gen_random_bytes(), used for the invite code default
-- below. gen_random_uuid() (used for every table's `id` column already)
-- ships in Postgres core since v13, but gen_random_bytes() does not — it's
-- pgcrypto's. Installed into the `extensions` schema per Supabase's own
-- convention (never `public`), and called schema-qualified in the default
-- expression below so it doesn't depend on the session's search_path.
create extension if not exists pgcrypto with schema extensions;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Placeholder generation scheme: 6 random bytes, hex-encoded (12 chars).
  -- Collision odds at this app's scale are negligible; the future
  -- redeem_invite RPC can revisit format/collision handling (retry-on-
  -- conflict, a shorter human-typeable alphabet, etc.) — this column just
  -- needs to be real and unique today, not the final word on invite-code UX.
  code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  -- No ON DELETE action (defaults to NO ACTION), matching items.added_by's
  -- reasoning: preserves attribution of who created the invite rather than
  -- silently nulling it out or cascading.
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id)
);

create index invites_household_id_idx on public.invites (household_id);

alter table public.invites enable row level security;

-- authenticated gets SELECT/INSERT only, gated by household membership
-- below; service_role gets full privileges ungated (bypasses RLS by role
-- attribute) for seeding/admin work and the future redeem_invite RPC,
-- matching the grant convention already established for the other four
-- tables in 20260906071903_household_schema_and_rls.sql. Deliberately no
-- UPDATE/DELETE grant to `authenticated` at all — not just no policy —
-- since redemption (the only thing that would ever update or delete an
-- invite row) is out of scope here and reserved for redeem_invite's
-- service-role path.
grant select, insert on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;

-- Two separate policies (not one `for all`, unlike the other four tables)
-- so INSERT/SELECT are the only operations `authenticated` can ever
-- satisfy — there is no UPDATE or DELETE policy at all, so those
-- statements are rejected outright for authenticated regardless of
-- membership, rather than merely narrowed by a `using`/`with check` clause.
create policy invites_select on public.invites
  for select
  to authenticated
  using (public.is_household_member(household_id));

create policy invites_insert on public.invites
  for insert
  to authenticated
  with check (public.is_household_member(household_id));
