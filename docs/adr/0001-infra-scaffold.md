# 1. Infra/boilerplate scaffold

**Status:** Accepted

## Context

The repo had no code — the product and its full architecture (framework, data model, retrieval approach, Supabase scope) were already settled in Notion (see `CLAUDE.md`). This ADR covers only the scaffolding choices needed to turn that design into a runnable shell: bundler/framework version, PWA tooling, test runner, lint setup. It does not cover product decisions — those are recorded elsewhere and weren't relitigated here.

The data layer (schema, RLS, the four atomic RPC functions) is explicitly out of scope for this scaffold — deferred to a human-driven Pair session per the working agreement in `CLAUDE.md`.

## Decisions

**Next.js 16, App Router, Turbopack (default).** Current stable as of this project starting. Turbopack is Next 16's default bundler for both `dev` and `build` — no flags or config needed for that; it matters below because it broke the standard PWA integration.

**PWA via `@serwist/turbopack`, not `@serwist/next`.** `@serwist/next`'s `withSerwistInit` hooks into Next's `webpack()` config function, which Turbopack never calls — it warns about this explicitly at build time and doesn't work under the default bundler at all. `@serwist/turbopack` is the Turbopack-native equivalent: a Route Handler (`src/app/serwist/[path]/route.ts`) builds and serves the service worker instead of a webpack plugin injecting it into `public/`. Confirmed against Serwist's own Turbopack docs, not assumed from the `@serwist/next` docs by analogy — the two packages have different integration shapes, not just different bundler backends.

**Vitest over Jest.** Matches the current official Next.js testing guide; noticeably faster for this project's size. One smoke test only — proving the harness works, not coverage theatre.

**ESLint flat config, `typescript-eslint` strict + stylistic (type-checked), plus `jsx-a11y`'s fuller rule set layered onto Next's built-in subset.** `eslint-config-next` already registers `jsx-a11y` and enables 6 of its rules; pulling in `jsxA11y.flatConfigs.recommended` wholesale double-registers the plugin and errors, so only its `rules` object is merged in. The Definition of Done requires keyboard nav and semantic HTML — worth enforcing in tooling, not just discipline.

**Supabase CLI as a devDependency, not a global install.** The package now blocks global `npm install -g supabase`. `supabase init` only — `supabase/migrations/` stays empty.

**`src/lib/database.types.ts` is a hand-written placeholder**, not generated. `supabase gen types typescript --local` needs a running local stack (Docker) and at least one migration; this environment had neither. The placeholder matches the shape an empty-schema generation produces so the Supabase client factories type-check now — flagged in the file itself, regenerate for real once the Pair session adds a migration.

## Rejected

- **`next-pwa`** — unmaintained for App Router.
- **A hand-rolled service worker** — reinvents what Serwist already does correctly (precache manifest injection, offline fallback routing).
- **Jest** — Vitest is what Next's current docs point to and is materially faster.
- **Wiring `supabase start`/`db:types` into CI** — nothing to check yet against zero migrations; revisit once the schema exists.
- **A blanket service-role Supabase client anywhere in `src/server/db`** — the design explicitly restricts the service-role key to one call site (`redeem_invite`), which doesn't exist yet. Scaffolding a general-purpose one here would make it too easy to reach for later and quietly bypass RLS.

## Consequences

- Anyone touching the PWA setup needs to know it's Turbopack-specific — the `@serwist/next` docs and most Serwist tutorials online describe the webpack-plugin flow, which won't apply here.
- `src/lib/database.types.ts` will get a large diff the first time real types are generated — expected, not a regression.
- Supabase is deprecating `anon`/`service_role` key names for `publishable`/`secret` by end of 2026. This scaffold uses the current names (matching `CLAUDE.md`); worth reconfirming before the Pair session wires up a real project.
