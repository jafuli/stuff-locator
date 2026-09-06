# Stuff Locator

A mobile-first PWA where a couple shares one household inventory of ~20–50 hard-to-find items — spare keys, passport, camping gear. Add an item with room + container + free-text detail; find it by whatever you call it today via in-browser semantic search; browse by location; see who moved what and when.

Full product and architecture context lives in [`CLAUDE.md`](./CLAUDE.md) and this repo's [`docs/adr/`](./docs/adr).

## Status

Schema + RLS landed: `households`, `household_members`, `locations`, `items` exist in `supabase/migrations/`, with row level security isolating every table to its own household (see [ADR 0003](./docs/adr/0003-schema-rls-foundations.md)). The four atomic RPC functions (`move_item`, `move_container`, `delete_container`, `redeem_invite`), any `src/app/api/**` route handlers, and wiring the frontend off its fixtures are still deferred to a Pair session (see the working agreement in `CLAUDE.md`).

## Prerequisites

- Node.js 22+
- [Docker](https://www.docker.com/) — required for the local Supabase stack

## Setup

```bash
npm install
cp .env.example .env.local   # fill in real values once a Supabase project exists
npm run dev
```

For local Supabase (Postgres + Auth + PostgREST, no cloud project needed):

```bash
npm run supabase:start   # requires Docker; prints local URL/keys for .env.local
npm run db:types         # regenerate src/lib/database.types.ts after any migration
npm run supabase:stop
```

`src/lib/database.types.ts` is generated from the real local schema — regenerate it (`npm run db:types`) after any new migration.

RLS isolation is proven by an integration test against the local stack — see `npm run test:rls` below.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint (Next config + typescript-eslint strict + jsx-a11y) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Run the unit/component test suite once (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:rls` | RLS household-isolation integration test — requires `npm run supabase:start` and `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` exported (printed by `supabase:start`) |
| `npm run test:e2e` | Playwright UI-smoke check (builds, boots the app, checks it) |

## Layout

```
src/app/**          UI — never imports src/server
src/app/api/**       HTTP boundary (empty — Pair session)
src/server/services/** Validation, authorisation, orchestration (empty — Pair session)
src/server/db/**     Supabase client factories (browser + server, JWT-forwarding)
src/lib/**           Env validation, shared types/schemas
supabase/migrations/** Schema, RLS, RPC functions (empty — Pair session)
```
