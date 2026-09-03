# 2. Playwright UI-smoke gate

**Status:** Accepted

## Context

CLAUDE.md's frontend Definition of Done requires (among other things) no
console errors/warnings and full keyboard navigability. Vitest + Testing
Library (already in place, see ADR 0001) render components in jsdom — a
simulated DOM, not a real browser — so it can't catch things like an actual
browser console error, or prove an element is reachable by pressing Tab in a
real focus-order sense. This task ships the first real route
(`src/app/page.tsx`), so it's the first point where that gap actually
matters, and the task asked for this to become "the standing pre-merge UI
gate for every future PR," not a one-off check for this one route.

## Decisions

**Playwright, via `@playwright/test`.** It was already sitting in
`package-lock.json` as an *optional peer dependency* of `next` itself
(unused until now) — installing it directly as a devDependency, rather than
relying on the transitive optional peer, makes the version pin explicit and
independent of whatever Next happens to declare as a peer.

**Chromium only, one spec, smoke-scoped.** `e2e/home.spec.ts` boots the real
app (`npm run build && npm run start`), loads `/`, and asserts: no
`console`/`pageerror` events fired, the key elements (heading, search input,
both nav links, an item) are present, and the Activity nav link is reachable
by literally pressing Tab from the top of the document (not `.focus()`,
which would pass even if the element weren't in tab order). This is
deliberately a smoke check, not a coverage suite — one browser, one route,
proving the shell boots and is usable.

**Self-contained `webServer` command (`npm run build && npm run start`),
not `next dev`.** Dev mode compiles routes on first request, which is slow
and non-deterministic for a CI timeout; a production build is what actually
ships. The `webServer` command rebuilds even though `ci.yml` already runs
`npm run build` as its own earlier step — mildly redundant in CI, but it
means `npm run test:e2e` also works standalone, locally, without depending
on a prior step having already populated `.next`.

**Vitest must explicitly exclude `e2e/**`.** Vitest's default test glob
(`**/*.{test,spec}.*`) would otherwise also pick up `e2e/home.spec.ts` and
try to run it as a Vitest test — it imports Playwright's incompatible
`test`/`expect`, so it fails immediately. `vitest.config.mts` now sets
`test.exclude: [...configDefaults.exclude, "e2e/**"]` (spreading Vitest's
own defaults rather than overwriting them, so `node_modules` etc. stay
excluded too). Easy to miss since both frameworks default to the same
filename convention — worth documenting here.

## Rejected

- **Cypress** — Playwright's `webServer` config and multi-browser story are
  a better fit than Cypress's, and there was no existing Cypress usage to
  match.
- **Vitest's browser mode / `@vitest/browser-playwright`** — already
  present in `package-lock.json` as an unused optional peer of `vitest`.
  Runs component-level tests in a real browser but isn't an E2E/navigation
  tool in the way this task needs (booting the actual `next start` server
  and driving real page navigation) — a different tool for a different
  layer, not a substitute for Playwright here.
- **A full cross-browser matrix (Firefox/WebKit projects)** — real cost for
  a smoke gate at this stage; nothing in the product depends on
  browser-specific behavior yet. Easy to add more `projects` later if that
  changes.

## Consequences

- Every future PR touching UI now has this gate in CI (`.github/workflows/ci.yml`),
  after `lint`/`typecheck`/`test`/`build`.
- Local `npm run test:e2e` needs Playwright's browser binaries installed once
  (`npx playwright install --with-deps chromium`) — not automated as part of
  `npm install`, matching how the repo already treats `supabase` (CLI
  present as a devDependency, but `supabase start` is a manual, documented
  step in the README).
- `e2e/**` and Playwright's own output directories (`test-results/`,
  `playwright-report/`, `playwright/.cache/`, `blob-report/`) are gitignored.
