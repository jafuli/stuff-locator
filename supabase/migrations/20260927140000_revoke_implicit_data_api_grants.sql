-- Data API privileges are declared here, not inherited
--
-- Every earlier migration in this directory granted narrowly and said so in
-- its comments ("authenticated gets SELECT/INSERT only", "Deliberately no
-- UPDATE/DELETE grant to `authenticated` at all"). None of that was true in
-- the database. The Supabase Postgres image's own init script runs
--
--   alter default privileges in schema public
--     grant all on tables to postgres, anon, authenticated, service_role;
--
-- so every table `postgres` creates in `public` starts with
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for anon AND
-- authenticated. A GRANT only ever adds privileges, so those narrow grants
-- re-granted what was already held and restricted nothing.
--
-- What it cost: `anon` — an unauthenticated caller holding only the public
-- anon key — had full DML on every table, `profiles` (the one table here
-- holding personal data) included. RLS still stopped it (every policy
-- is `to authenticated`), so this was a lost layer rather than an open door,
-- but the layer the migrations claimed to have was absent. It also made
-- supabase/tests/invites-rls.test.ts's "members have no UPDATE or DELETE
-- grant at all" case fail: with the privilege present, a member's UPDATE
-- reaches RLS, matches no UPDATE policy, is filtered to zero rows, and
-- PostgREST answers with success — not the 42501 the test expects.
--
-- Two halves to the fix, and both are needed:
--   * supabase/config.toml's `auto_expose_new_tables = false` makes the CLI
--     revoke those default privileges, so entities created from here on need
--     an explicit GRANT to be reachable. Future entities only — ALTER DEFAULT
--     PRIVILEGES never touches objects that already exist.
--   * this migration, for the objects that already exist: every local dev
--     database, and any cloud project whose "Default privileges for new
--     entities" setting was on when its tables were created.
--
-- Deploying this to a live database TIGHTENS privileges, which is the one
-- genuinely risky shape a grants migration has: a client relying on an
-- inherited grant breaks at deploy time, not at review time. Audited before
-- writing it — nothing relies on one. The app holds no service-role key at
-- all (see src/server/db/server.ts), and the integration tests'
-- service-role client only reads and writes through the grants below.
--
-- Full reasoning: docs/adr/0005-data-api-privileges.md.

-- ---------------------------------------------------------------------------
-- Revoke first: `grant` cannot express "only these", a revoke can, and
-- starting from nothing is the only way the grants further down become the
-- whole truth instead of a subset of whatever was inherited.
--
-- Every object is named explicitly rather than swept up with `revoke all on
-- all tables in schema public`. The sweep reads better and behaves worse: a
-- migration authored later but timestamped earlier would create its table
-- BEFORE this file runs, have its grants stripped here, and never get them
-- back, because a sweep cannot re-grant what it cannot name. That is not
-- hypothetical — `profiles` (20260927120000) was on an open branch while
-- this file was being written and merged before it, so it now runs first.
-- Naming objects keeps this migration a pure function of the schema as of
-- its own timestamp; tables created after it are the config flag's job
-- instead, which is the right division of labour between the two.
--
-- PUBLIC is revoked from functions specifically: EXECUTE defaults to PUBLIC
-- for every new function, a separate inheritance path from the table default
-- privileges above and just as silent. (The per-function migrations already
-- did this one; it is repeated here so the matrix is readable in one place.)
-- ---------------------------------------------------------------------------

revoke all on public.households from anon, authenticated, service_role;
revoke all on public.household_members from anon, authenticated, service_role;
revoke all on public.locations from anon, authenticated, service_role;
revoke all on public.items from anon, authenticated, service_role;
revoke all on public.invites from anon, authenticated, service_role;
revoke all on public.profiles from anon, authenticated, service_role;

revoke all on function public.is_household_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_household(text) from public, anon, authenticated, service_role;
revoke all on function public.move_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.move_container(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.delete_container(uuid) from public, anon, authenticated, service_role;
revoke all on function public.location_subtree_items(uuid) from public, anon, authenticated, service_role;
revoke all on function public.redeem_invite(text) from public, anon, authenticated, service_role;
revoke all on function public.shares_household_with(uuid) from public, anon, authenticated, service_role;
revoke all on function public.profile_display_name_for(text) from public, anon, authenticated, service_role;

-- The three trigger functions (items_enforce_location_household,
-- locations_enforce_parent_household, handle_new_user) are left alone, and
-- keep the EXECUTE
-- that PUBLIC gets on every new function. Revoking it would be theatre on
-- both ends: EXECUTE on a trigger function is checked when the trigger is
-- created rather than each time it fires, so it grants no ability to make
-- them run, and a direct call is refused by Postgres itself regardless of
-- privileges ("trigger functions can only be called as triggers"), so
-- PostgREST cannot expose them as RPCs either.

-- Schema USAGE is deliberately left in place for anon. Without table
-- privileges it grants no access, and keeping it means an anon caller gets a
-- clean 42501 ("permission denied for table items") instead of a confusing
-- "relation does not exist" — which is what
-- supabase/tests/data-api-grants.test.ts asserts, and what makes a real
-- denial distinguishable from RLS quietly filtering a statement to zero rows.
grant usage on schema public to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables. Re-asserted rather than left to the earlier migrations, so this one
-- file reads as the whole matrix. authenticated's privileges are gated by the
-- policies in those migrations; service_role's are ungated (it bypasses RLS
-- by role attribute) and exist for seeding/admin work, which in this repo
-- means the integration tests. anon gets nothing, anywhere.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.households to authenticated, service_role;
grant select, insert, update, delete on public.household_members to authenticated, service_role;
grant select, insert, update, delete on public.locations to authenticated, service_role;
grant select, insert, update, delete on public.items to authenticated, service_role;

-- invites: SELECT/INSERT for a member — create an invite, read your own
-- household's. No UPDATE/DELETE: redemption is redeem_invite's job, and that
-- function is SECURITY DEFINER, so it marks the row redeemed on the caller's
-- behalf without the caller ever holding the privilege itself. This is the
-- line supabase/tests/invites-rls.test.ts has been asserting all along.
grant select, insert on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;

-- profiles: rows are written by the on_auth_user_created trigger and removed
-- by the auth.users cascade (a cascade runs as an internal constraint
-- trigger, so it needs no DELETE privilege of its own), which is why neither
-- role gets INSERT or DELETE. UPDATE is the "you can rename yourself"
-- policy.
grant select, update on public.profiles to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Functions. EXECUTE for authenticated only — no other Data API role is
-- meant to call any of these. service_role in particular: it inherited
-- EXECUTE on all of them and needs none, since nothing in this repo calls an
-- RPC with the service-role key.
--
-- is_household_member and shares_household_with are not RPCs: they run
-- inside policy predicates, which evaluate as the querying role, so
-- authenticated needs EXECUTE on them for its own ordinary reads to work at
-- all.
--
-- profile_display_name_for is revoked above and deliberately not re-granted:
-- it is only ever called from handle_new_user (SECURITY DEFINER) and from
-- the backfill in its own migration, both of which run as the owner.
-- ---------------------------------------------------------------------------

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.move_item(uuid, uuid) to authenticated;
grant execute on function public.move_container(uuid, uuid) to authenticated;
grant execute on function public.delete_container(uuid) to authenticated;
grant execute on function public.location_subtree_items(uuid) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
