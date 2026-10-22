# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The app is real and running locally. Next.js 16 (App Router) + React 19 + TypeScript strict, Tailwind v4, Supabase (Auth + Postgres) with RLS on every table, and a serwist service worker for the PWA side. Tooling is in place and enforced in CI: `npm run lint` / `typecheck` / `test` (Vitest + Testing Library) / `build` / `test:e2e` (Playwright, chromium-only, plus axe) — see the script table in `README.md`.

Built and merged: auth (sign-up/in/out, password reset), household bootstrap, Stash, Home, Browse including the recursive subtree read, item detail/edit/delete, and the invite/redeem partner flow — all reading and writing real household data through RLS-scoped PostgREST calls, with `create_household`, `move_item` and `redeem_invite` as `plpgsql` functions in `supabase/migrations/` (`move_container` and `delete_container` are migrated but have no caller yet; `location_subtree_items`, the recursive subtree read, is `language sql`). Also merged: route protection (`src/proxy.ts`, ADR 0006) and explicit Data API privileges — `anon` has no table access and every grant is named in a migration (ADR 0005). Decisions taken here are recorded in `docs/adr/`.

One thing is deliberately not what the design describes yet, and shouldn't be reported as done: **Find is a case-insensitive substring filter**, not the `transformers.js` embedding search (`transformers.js` isn't a dependency yet; `src/lib/fixtures/search.ts` is a stand-in behind the final `(items, query) => items` signature). Activity is a real, append-only event log (ADR 0011; see the next paragraph). Check what's actually merged before describing the state of a flow — several routes changed hands recently.

**Locations refactor — built (Notion "Locations 1/7"–"7/7", a stack of PRs).** ADR 0010 (nested location capture) and ADR 0011 (activity events) record the decisions; the bullets below state the rules. What it added: place names are normalized and unique per parent ignoring case (a unique index); the internal `ensure_location_path`; `SECURITY DEFINER` writers `stash_item`, `move_item` (optional new path), `update_item`, `delete_item`, `create_location`, `rename_location`, `move_container` and `delete_container`, each appending its event to `activity_events` in the same transaction; direct INSERT / UPDATE / DELETE on `items` and `locations` revoked from `authenticated`. The Activity feed reads only `activity_events` (all eight kinds, every move kept with where it moved from; place creation is not an event); the provenance columns on `items` stay as a convenience copy for item detail. The chip path picker is the only way to choose a place in Stash, item edit and onboarding. Browse has "+ Add a place here" and a ⋯ menu on a place's page (Rename / Move into… / Delete, blocked until empty); `/locations/new` is gone. The Stuff screen has the `All (n)` / `By place` chips that lead into `/browse`. If a branch predates part of that stack, check what is actually merged before describing a flow.

Design work happened in Notion, not in this repo. The decisions below are transplanted from there because they constrain implementation and aren't derivable from the code alone. **Do not redo the design** — if something in it looks wrong, raise it, don't silently rebuild it. Source of truth: the "Stuff Locator" and "Portfolio Hub" pages in Notion. The current wireframes (v2, the locations refactor) are committed at `docs/stuff-locator-wireframes/index.html`; `index.v1.html` beside it is the original, kept for context. The visual look is a separate, later layer: the **Stuff Locator design system** ("Label Maker", v0.1 draft, kept as a Claude design artifact and summarised in the Notion "Design 1/5" task) supplies the tokens, type and components — see "Visual design" below. The wireframes decide *what* each screen does; the design system decides how it looks.

## Visual design

The look comes from the **Stuff Locator design system** ("Label Maker"), not from the wireframes' grey styling. Rules for any UI work:

- **Tokens live in `src/app/globals.css`** and come from the Label Maker design system: 13 colors (light + dark, following `prefers-color-scheme`), spacing, radii, shadows, sizes and nine type styles. Use the utilities they generate (`bg-surface`, `text-muted`, `rounded-panel`, `text-title`, `min-h-control-height`, …). If a token doesn't work in the real UI, flag it in the PR and update the system — don't quietly diverge here.
- **No raw hex values or wireframe px sizes in components** — no `#1a1a1a`, no `text-[12px]`, no `rounded-[8px]`. The only justified exceptions are places that can't read CSS variables (the web manifest and `themeColor`, which must hard-code `paper`) and they carry a comment saying so.
- **Tape is for the last segment of a location only** — `BEDROOM › DESK › [TOP DRAWER]`, with only the bracketed segment on label tape. Never use tape on anything that isn't a location.
- **One `display` heading per screen**, phrased as the screen's question ("What are you looking for?").
- Quiet by default: weights 400/500 (600 at most, never 700/800), thin warm borders, soft shadows. `signal` is the one accent — Closest match, destructive actions and errors — as text or a small marker, never a large fill. Text first; line icons only (1.5px stroke, round caps, `currentColor`), no emoji.
- A control's only edge is `border-strong`, never `border-control` (below 3:1); every interactive element gets the 2px `focus` outline with a 2px offset; inputs are 16px.
- The wireframe tokens (`--mid`, `--dim`, `--line`, `--wash`, `--note`, `--font-wire*`) are gone — don't reintroduce them. A check that the rule holds: `rg 'text-\[|rounded-\[|#[0-9a-f]{3,6}' src/components src/app -i` should return only `globals.css` (where the tokens are defined) and the commented `themeColor` / manifest exceptions.
- `/~components` (dev only) shows the tokens and every shared primitive in both themes — add new primitives there.

## What this app is

A mobile-first PWA where a couple shares one household inventory of ~20-50 hard-to-find items (spare keys, passport, camping gear — not a whole-house catalog). Core flows: **Stash** (record item + room + container + free-text detail), **Find** (semantic search by whatever you call it today), **Browse** (by location), **Catch up** (activity feed of who moved what).

Explicitly out of scope for v1: whole-house inventory, any LLM/generative feature, photo/barcode/OCR capture, households larger than a couple, expiry reminders.

## Accepted architecture decisions

**No open architecture decisions remain** — scope, platform, data model, retrieval, backend shape and Supabase scope are all settled. The only open items anywhere are cosmetic UI questions on the wireframes (match tags, escape-hatch placement) — not architectural, don't block on them.

- **Platform**: Next.js + TypeScript, mobile-first PWA (installable, offline-capable). Not React Native — nobody installs a candidate's native app, and it signals the wrong role.
- **Data ownership**: items and locations belong to a **household**, not a user (`household → members`, `household → items`). This is load-bearing for the schema — don't scope tables to `user_id` instead.
- **Backend shape**: Next.js + Supabase SDK, own service layer — not Drizzle (considered and rejected; the backend reps were never in the data-access layer). Reads go direct via PostgREST behind RLS. Writes that carry invariants go through route handlers.
- **Atomic operations are Postgres functions, not TypeScript.** `supabase-js` goes through PostgREST, which wraps each request in its own transaction, so two SDK calls can never be atomic together. `move_item`, `move_container`, `delete_container`, and `redeem_invite` are `plpgsql` functions invoked via `.rpc()`, and so — as the Locations refactor lands — are `stash_item`, the internal `ensure_location_path` (not granted to `authenticated`; only other functions call it), `create_location`, `rename_location`, `update_item` and `delete_item`. Once the refactor lands, these functions are the only write path for `items` and `locations`: `authenticated` keeps `SELECT` and loses `INSERT` / `UPDATE` / `DELETE` on both. Server-side clients forward the user's JWT so RLS still applies; the app never holds a service-role key. `create_household` and `redeem_invite` are `SECURITY DEFINER` (the caller isn't yet a member when they run), so they work with the caller's own JWT; the service-role key exists only in the integration tests (`supabase/tests/`), for seeding and cleanup. `household_members` is read-only for `authenticated` (ADR 0007) — membership changes only happen inside those functions. `activity_events` follows the same pattern (ADR 0011): `authenticated` can only read it, so every function that appends an event — `stash_item`, `move_item`, `update_item`, `delete_item`, `rename_location`, `move_container` and `delete_container` — is `SECURITY DEFINER` with its own explicit membership check rather than leaning on RLS (`create_location` writes no event, but is a definer function too, since direct writes are locked).
- **Supabase scope**: Auth + Postgres only — no Storage, no Realtime, no Edge Functions in v1 (realtime sync between members is a v2 candidate). Migrations via the Supabase CLI, versioned in `supabase/migrations/` and committed — **never through the dashboard**. Types generated with `supabase gen types typescript`. Local dev runs the full local stack via `supabase start` (requires Docker).
- **Locations**: self-referencing table with optional `parent_id`, arbitrary nesting depth (`garage → closet → toolbox → keys` must be representable). "Everything in X" is a recursive CTE over the subtree. Cycle prevention on move (a container can't be placed inside its own descendant) is server-side, under lock. Capture allows any depth but never *requires* more than one level — a single place is always a complete answer (ADR 0010).
- **Search**: client-side sentence embeddings via `transformers.js` in a web worker, lazy and connection-aware, cosine similarity in memory, model weights cached by the browser after first load, degrades to fuzzy string match while loading or on failure. No LLM, no API key, no server round-trip for search. Matching uses **max similarity across the bare item name and the enriched string** (appended detail text is high-variance on its own). Design rules this forced: ranked lists (never a single answer), no similarity-score thresholds, don't persist vectors.
  - Measured (two rounds, Aug 16): 19/20 correct within top 3 on queries sharing no words with their targets. 23.0MB payload, 3.39s cold load, 6.1ms per embedding.
- **Location capture**: two halves (ADR 0010).
  - *Finding* a place: autocomplete against existing rooms/containers over **full paths** — typing "red" should reach `Garage › Closet › Toolbox › Red box` in three characters. Without this you get "garage" / "Garage" / "the garage" as three different places, and browsing quietly dies.
  - *Creating* a place: a chip path builder — pick or create one level at a time; each level becomes a chip and typing continues inside it. New places are saved atomically with the item (`stash_item`), never on their own. Place names are unique per parent, ignoring case (the same name under different parents is fine).
- **Browse**: the Stuff screen has `All (n)` / `By place` chips under search, and By place opens `/browse`, which shares that header so the chips read as one toggle. Browse is navigate + tidy up: a ⋯ menu on a place's own page (Rename / Move into… / Delete), plus a name-only "+ Add a place here". Delete is **blocked until the place is empty** (decided for v1). `/locations/new` is gone — places are created in the picker, or with "+ Add a place here".
- **Onboarding**: guided creation of a few specific starter items (a filed document, a bulky object, a small hidden thing) ending in "invite your partner" — this doubles as the demo script.

## Working agreement for this repo

> **Pair-mode restriction lifted, for now (2026-09-03, Portfolio Hub Design Journal).** Itamar: "everything is Autonomous-safe. no pair programming limitations for now, in stuff locator and in general." The `Mode` gate below is currently **not enforced** — the scheduled task watcher picks the highest-priority `Ready for Claude` task regardless of Mode, and a `Pair`-tagged task can be dispatched and implemented unattended. Everything else (Teaching PR format, frontend DoD, never merging your own PR, flagging ambiguity instead of guessing) is unchanged. The `Mode` property still exists on task rows and still records what a task *would* be gated as — it's the mechanism to bring the restriction back, not dead metadata. This is explicitly reversible; if the restriction returns, revert this note and re-enable the Mode filter in the scheduled task's prompt.

Every task in the Notion queue carries a **Mode** that governs whether it can be done unattended:

| Mode | What happens | Runs unattended? |
|---|---|---|
| Autonomous | Claude builds it alone, opens a teaching PR. UI, components, styling, tests, content, config, refactors. | Yes |
| Prep for Pair | Claude writes the spec, scaffolds files, stubs signatures, writes failing tests — then stops. No implementation. | Yes |
| Pair | Itamar at the keyboard. Data layer, API routes, auth/login. Claude assists, does not drive. | **Never**, unless the restriction above is lifted |

For scheduled/unattended runs, while the restriction above is active: only pick up tasks that are both `Ready for Claude` **and** `Autonomous`. If the only ready work is `Pair`, do nothing and say so — never implement a Pair task unattended, regardless of priority.

Why the split exists at all: the target roles interview hard on backend, which is the rusty area, so data layer / API routes / auth were meant to be written by Itamar so he can defend them in an interview. That reasoning isn't wrong — it's just not the active constraint right now, per the note above.

### Teaching PR format

Every Autonomous PR opens with a short walkthrough (readable on a phone in ~3 minutes):
1. **What this does** — one paragraph, plain language
2. **Why this approach** — the decision made and what it beat
3. **What was rejected** — the alternative and why it lost
4. **Worth a closer look** — anything subtle, risky, or likely to come up in an interview
5. **How to test** — the commands to run and, for UI, what to click through, including what CI can't cover (e.g. `npm run test:rls` needs local Supabase)

Also: never merge your own PRs. Anything ambiguous goes in the PR/task notes instead of being guessed at.

### Definition of done (frontend work)

Not optional polish — a task isn't done unless all hold:
- Keyboard navigable, visible focus states
- Semantic HTML (real buttons/headings/labelled inputs; ARIA only where semantics run out)
- Loading, empty, error, and success states all handled explicitly
- Responsive from 320px to desktop, no horizontal scroll
- Type safe — no `any`, no non-null assertions to silence the compiler
- Sensible component boundaries — one thing per component, no grab-bag props
- Tests on the tricky logic, not coverage theater
- No console errors/warnings in the browser
- Formatted: `npm run format` (Prettier, config in `.prettierrc.json`: 2-space indent, 120 cols) — CI runs `format:check`, so run it before opening a PR. Don't let an IDE reformat with its own style; `.editorconfig` pins 2 spaces for it

## Notes for autonomous sessions

- Don't push the project timeline at Itamar — report status when asked, flag genuine blockers, otherwise leave pacing to him.
- Publish architecture write-ups as ADRs in this repo (not only in Notion) once real decisions get made here.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
