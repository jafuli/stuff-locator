# Stuff Locator

A mobile-first PWA where a couple shares one household inventory of ~20–50 hard-to-find items — spare keys, passport, camping gear. Add an item with room + container + free-text detail; find it by whatever you call it today via in-browser semantic search; browse by location; see who moved what and when.

Full product and architecture context lives in [`CLAUDE.md`](./CLAUDE.md) and this repo's [`docs/adr/`](./docs/adr).

## Status

Infra scaffold only — no data layer yet. `supabase/migrations/` is intentionally empty. Schema, RLS policies, and the four atomic RPC functions (`move_item`, `move_container`, `delete_container`, `redeem_invite`) are deliberately deferred to a Pair session (see the working agreement in `CLAUDE.md`) rather than written unattended.

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

`src/lib/database.types.ts` currently ships as a hand-written placeholder matching an empty-schema `db:types` output — see the comment at the top of that file.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint (Next config + typescript-eslint strict + jsx-a11y) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Vitest in watch mode |

## Layout

```
src/app/**          UI — never imports src/server
src/app/api/**       HTTP boundary (empty — Pair session)
src/server/services/** Validation, authorisation, orchestration (empty — Pair session)
src/server/db/**     Supabase client factories (browser + server, JWT-forwarding)
src/lib/**           Env validation, shared types/schemas
supabase/migrations/** Schema, RLS, RPC functions (empty — Pair session)
```
