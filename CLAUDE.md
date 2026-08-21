# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This repository is empty of code (README only). The product is fully designed but **nothing has been built yet** — no framework, no dependencies, no build/lint/test tooling exists. Do not assume any of that is in place; check before referencing a command that isn't here yet, and update this file once real tooling lands.

Design work happened in Notion, not in this repo. The decisions below are transplanted from there because they constrain implementation and aren't derivable from code that doesn't exist yet. **Do not redo the design** — if something in it looks wrong, raise it, don't silently rebuild it. Source of truth: the "Stuff Locator" and "Portfolio Hub" pages in Notion.

## What this app is

A mobile-first PWA where a couple shares one household inventory of ~20-50 hard-to-find items (spare keys, passport, camping gear — not a whole-house catalog). Core flows: **Stash** (record item + room + container + free-text detail), **Find** (semantic search by whatever you call it today), **Browse** (by location), **Catch up** (activity feed of who moved what).

Explicitly out of scope for v1: whole-house inventory, any LLM/generative feature, photo/barcode/OCR capture, households larger than a couple, expiry reminders.

## Accepted architecture decisions

**No open architecture decisions remain** — scope, platform, data model, retrieval, backend shape and Supabase scope are all settled. The only open items anywhere are cosmetic UI questions on the wireframes (match tags, tab count, escape-hatch placement) — not architectural, don't block on them.

- **Platform**: Next.js + TypeScript, mobile-first PWA (installable, offline-capable). Not React Native — nobody installs a candidate's native app, and it signals the wrong role.
- **Data ownership**: items and locations belong to a **household**, not a user (`household → members`, `household → items`). This is load-bearing for the schema — don't scope tables to `user_id` instead.
- **Backend shape**: Next.js + Supabase SDK, own service layer — not Drizzle (considered and rejected; the backend reps were never in the data-access layer). Reads go direct via PostgREST behind RLS. Writes that carry invariants go through route handlers.
- **Atomic operations are Postgres functions, not TypeScript.** `supabase-js` goes through PostgREST, which wraps each request in its own transaction, so two SDK calls can never be atomic together. `move_item`, `move_container`, `delete_container`, and `redeem_invite` are `plpgsql` functions invoked via `.rpc()`. Server-side clients forward the user's JWT so RLS still applies; the service role key is used in exactly one place — `redeem_invite`, where the caller isn't yet a household member.
- **Supabase scope**: Auth + Postgres only — no Storage, no Realtime, no Edge Functions in v1 (realtime sync between members is a v2 candidate). Migrations via the Supabase CLI, versioned in `supabase/migrations/` and committed — **never through the dashboard**. Types generated with `supabase gen types typescript`. Local dev runs the full local stack via `supabase start` (requires Docker).
- **Locations**: self-referencing table with optional `parent_id`, arbitrary nesting depth (`garage → closet → toolbox → keys` must be representable). "Everything in X" is a recursive CTE over the subtree. Cycle prevention on move (a container can't be placed inside its own descendant) is server-side, under lock. The UI defaults to shallow (room → container) even though the model allows depth — don't let deep nesting leak into the default capture flow.
- **Search**: client-side sentence embeddings via `transformers.js` in a web worker, lazy and connection-aware, cosine similarity in memory, model weights cached by the browser after first load, degrades to fuzzy string match while loading or on failure. No LLM, no API key, no server round-trip for search. Matching uses **max similarity across the bare item name and the enriched string** (appended detail text is high-variance on its own). Design rules this forced: ranked lists (never a single answer), no similarity-score thresholds, don't persist vectors.
  - Measured (two rounds, Aug 16): 19/20 correct within top 3 on queries sharing no words with their targets. 23.0MB payload, 3.39s cold load, 6.1ms per embedding.
- **Location capture**: autocomplete against existing rooms/containers over **full paths** (not a cascading picker) — typing "red" should reach `Garage › Closet › Toolbox › Red box` in three characters. Without this you get "garage" / "Garage" / "the garage" as three different places, and browsing quietly dies.
- **Onboarding**: guided creation of a few specific starter items (a filed document, a bulky object, a small hidden thing) ending in "invite your partner" — this doubles as the demo script.

## Working agreement for this repo

Every task in the Notion queue carries a **Mode** that governs whether it can be done unattended:

| Mode | What happens | Runs unattended? |
|---|---|---|
| Autonomous | Claude builds it alone, opens a teaching PR. UI, components, styling, tests, content, config, refactors. | Yes |
| Prep for Pair | Claude writes the spec, scaffolds files, stubs signatures, writes failing tests — then stops. No implementation. | Yes |
| Pair | Itamar at the keyboard. Data layer, API routes, auth/login. Claude assists, does not drive. | **Never** |

For scheduled/unattended runs: only pick up tasks that are both `Ready for Claude` **and** `Autonomous`. If the only ready work is `Pair`, do nothing and say so — never implement a Pair task unattended, regardless of priority.

Why the split: the target roles interview hard on backend, which is the rusty area, so data layer / API routes / auth are written by Itamar so he can defend them in an interview. Everything else is delegated.

### Teaching PR format

Every Autonomous PR opens with a short walkthrough (readable on a phone in ~3 minutes):
1. **What this does** — one paragraph, plain language
2. **Why this approach** — the decision made and what it beat
3. **What was rejected** — the alternative and why it lost
4. **Worth a closer look** — anything subtle, risky, or likely to come up in an interview

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

## Notes for autonomous sessions

- Don't push the project timeline at Itamar — report status when asked, flag genuine blockers, otherwise leave pacing to him.
- Publish architecture write-ups as ADRs in this repo (not only in Notion) once real decisions get made here.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
