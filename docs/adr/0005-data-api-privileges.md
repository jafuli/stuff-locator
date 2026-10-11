# 5. Data API privileges are declared, not inherited

**Status:** Accepted

## Context

`supabase/tests/invites-rls.test.ts` had a failing case — "members have no
UPDATE or DELETE grant at all — rejected before RLS even applies" — and it had
been failing since the invites migration landed, on `main`, unnoticed. Nothing
ran it: the suite under `supabase/tests/` needs a real Postgres, so it is
excluded from `npm run test` on purpose (`vitest.integration.config.mts`), and
CI only ever ran `npm run test`, `npm run build` and the Playwright specs.

The test was right and the schema was wrong. Every migration in this repo
grants narrowly and says so —
`20260914080000_invites_schema_and_rls.sql`: *"Deliberately no UPDATE/DELETE
grant to `authenticated` at all — not just no policy"* — but the Supabase
Postgres image's init script runs, before any of our migrations:

```sql
alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
```

A `GRANT` only adds. So `grant select, insert on public.invites to
authenticated` re-granted two privileges out of seven that role already held,
and restricted nothing. Checked directly:

```
select has_table_privilege('authenticated','public.invites','UPDATE');  -- t
select has_table_privilege('anon','public.items','DELETE');             -- t
```

That is why the test failed, and the failure mode is the interesting part: the
UPDATE was never refused, it was *filtered*. RLS found no UPDATE policy, cut
the statement to zero rows, and PostgREST returned success. The test asserted
`error.code === '42501'` and got `error === null`.

`supabase/config.toml` carried the belief that made this invisible. Its
comment claimed *"When unset, new entities are NOT auto-exposed, matching the
new cloud default"*. The installed CLI documents the opposite polarity — unset
means auto-exposed; `false` is what revokes — and the database agreed with the
CLI. `20260906071903_household_schema_and_rls.sql` cites that comment as the
reason its grants matter.

Nothing was exploitable. Every policy in the schema is `to authenticated`, so
`anon` — holding full DML on every table, `profiles` and its display names
included — was still stopped by RLS on every statement. What was missing is the layer the migrations claimed to have,
and the ability of a test to tell a privilege check from a policy check.

## Decisions

**Both halves of the fix, because neither is sufficient alone.**
`api.auto_expose_new_tables = false` in `supabase/config.toml` makes the CLI
revoke the default privileges, so anything created from now on needs an
explicit `GRANT` — but `ALTER DEFAULT PRIVILEGES` never touches objects that
already exist. `20260927140000_revoke_implicit_data_api_grants.sql` handles
those: every local dev database, and any cloud project whose "Default
privileges for new entities" setting was on when its tables were created. The
flag owns the future, the migration owns the present.

**The migration revokes wholesale, then re-grants the full matrix in one
place.** `GRANT` cannot express "only these"; a `REVOKE` can. Re-asserting
grants that earlier migrations already contain is duplication, and worth it:
one file now answers "what can each role actually do" without cross-reading
six migrations and knowing about default privileges.

**It names every object explicitly instead of `revoke all on all tables in
schema public`.** The sweep reads better and behaves worse. A migration
authored later but timestamped earlier creates its table *before* this file
runs, has its grants stripped by the sweep, and never gets them back, because
a sweep cannot re-grant what it cannot name.

This was not hypothetical. `profiles` (`20260927120000`) was on an open branch
while this file was being written, merged before it, and so runs first —
exactly the interleaving the sweep would have broken, and CI confirmed the
named form survives it. Naming objects keeps the migration a pure function of
the schema as of its own timestamp, and leaves tables created *after* it to
the config flag.

The corollary is that a table landing on a branch, as `profiles` did, has to
be added here by hand. A `db reset` covers a local database either way, but a
deployed one has no reset: migrations are the only lever there, so a table
left out keeps its inherited grants indefinitely. That is why `profiles` is
named in this migration rather than left to its own — its own grants are
already correct for a database built after the config flag, and wrong for
every database built before it.

**Schema `USAGE` stays granted to `anon`.** With no table privileges it grants
no access, and keeping it is what makes a denial legible: `anon` gets
`42501 permission denied for table items` rather than a misleading "relation
does not exist".

**A denial test must distinguish 42501 from a silently filtered write.** This
is the lesson the bug taught, and it is now load-bearing in two places. A
missing privilege makes Postgres refuse the statement — `42501` on `SELECT`,
`UPDATE` and `DELETE` alike. A privilege with no matching policy makes RLS
decide instead: a `SELECT` returns `[]` with no error, an `UPDATE` or `DELETE`
reports success having touched nothing. "anon can't see anything" passes under
both, which is precisely why nothing caught this.
`supabase/tests/data-api-grants.test.ts` asserts the erroring shape for the
`anon` role, and deliberately leaves `INSERT` out — an RLS `WITH CHECK`
violation also raises `42501`, so a failed insert proves nothing either way.

**CI runs `npm run test:rls`.** The stack that the e2e specs already start is
enough to run it, so this costs one step and no new infrastructure. It runs
before the browser specs: a grant or policy regression is cheaper to read off
a failed assertion than off a failed page interaction. A test suite that no
automation runs is documentation, and documentation was exactly what this one
had degraded into.

## Rejected

**Rewriting the test to assert the no-op.** It would have passed, immediately,
and encoded "a member can issue an UPDATE against an invite and be told it
worked" as intended behaviour. The assertion was the more accurate of the two
things in conflict; the schema was what needed changing.

**Revoking on `invites` alone.** The smallest change that makes the red test
green. It leaves `anon` holding full DML on `households`,
`household_members`, `locations` and `items`, and leaves the next table
created here inheriting the same grants — fixing the symptom that was visible
because a test happened to point at it.

**The config flag alone.** Correct for every table created from now on, and it
would even have turned CI green, since CI builds a fresh database every run.
Every existing local database, and a deployed project, would have kept the
wide grants — the class of bug where CI proves the opposite of production.

## Consequences

Applying this to an existing database tightens privileges, which is the one
genuinely risky shape a grants migration has: a caller relying on an inherited
grant breaks at deploy time, not at review time. Audited before writing it —
nothing relies on one. The app holds no service-role key at all
(`src/server/db/server.ts`), so no privilege reaches production through that
path, and the integration tests' service-role client only touches the five
grants declared here. `service_role` also loses the `EXECUTE` it inherited on
every function; nothing in this repo calls an RPC with the service-role key.

Local databases created before this need `npx supabase db reset` for the
config flag to take effect on their existing tables — the flag only changes
how new objects are created, and `db reset` is what re-creates them.

New tables now need their grants written out or they are unreachable, which is
the intended cost. The failure is loud and immediate (`42501` on the first
read) rather than silent, which is the opposite of the failure this ADR exists
to record.
