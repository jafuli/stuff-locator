# 13. Page frames by route group; the proxy chooses what "/" serves

**Status:** Accepted, 2026-11-16. Follows PR #73 (marketing home) and builds
on ADR 0006 (route protection). **Amended 2026-11-17:** the Stuff screen moved
to `/stuff`, and `/` is now only the marketing home (see the amendment at the
end; the rewrite described below is gone).

## Context

The app has two page frames. Signed-in pages get the floating nav (Stuff /
Activity tabs and the household button) plus clearance at the end of the
scroller. Pages outside the app (the marketing home, the four auth pages, the
invite landing) get a centred column with the wordmark header, and no nav.

Until now the frame came from one root layout, with `SiteNav` deciding by
pathname (`ROUTES_WITHOUT_NAV`) whether to render itself. PR #73 then made "/"
serve two screens: the Stuff screen signed in, and the marketing home signed
out. A pathname can't tell those apart, so #73 hid the nav with
`body:has([data-without-app-shell]) [data-app-shell] { display: none }`. That
worked and didn't flash, but:

- a page hid a component it doesn't own, through a global selector;
- there were two opt-out mechanisms (a pathname list and a CSS marker);
- the hidden nav still mounted and ran its session hook.

## Decision

**The layout tree decides the frame.** Routes live in two route groups:

- `src/app/(app)/`: `/`, `/browse`, `/items/*`, `/activity`, `/settings/*`,
  `/~components`, `/~offline`. Its `layout.tsx` renders `SiteNav` and
  `NavClearance`.
- `src/app/(public)/`: `/welcome` (the marketing home), `/sign-in`,
  `/sign-up`, `/forgot-password`, `/reset-password`, `/join/[code]`. Its
  `layout.tsx` renders the standalone column. Each page renders its own
  `SiteHeader`, because the header's right-hand side differs.

The root `layout.tsx` keeps only the document, fonts, the service-worker
provider and the scroll container.

**The proxy decides what "/" serves.** `resolveRoute(pathname, search,
signedIn)` in `src/lib/route-access.ts` turns a request into a decision, and
`src/proxy.ts` acts on it:

- signed out and `/` → **rewrite** to `/welcome` (the address bar keeps `/`);
- `/welcome` asked for by name → redirect to `/` (one canonical URL; a
  rewritten request doesn't re-enter the proxy, so this never loops);
- otherwise the existing deny-by-default gate from ADR 0006.

`(app)/page.tsx` is only the Stuff screen again. The proxy's check is
optimistic (cookie claims), so if `getUser()` finds no user there, the page
redirects to `/sign-in`.

Two consequences, agreed when this was planned:

- `/join/[code]` moved to `(public)`. Its main audience has no account yet, so
  Stuff/Activity tabs that only bounce to sign-in were noise. A signed-in
  partner redeeming an invite sees no nav on that one page.
- The root `not-found.tsx` can't sit inside a group, so it's a standalone page:
  wordmark header plus "Page not found / Back to Stuff". A bad item or place id
  still 404s inside `(app)` (`items/[id]/not-found.tsx`,
  `browse/[id]/not-found.tsx`) and keeps the nav.

## Rejected

- **Keep the CSS `:has()` rule** (PR #73). It's small and works, but the frame
  is implicit, there are two mechanisms, and the nav mounts invisibly.
- **Have the nav check the session on the client** (`useHasSession`). The
  answer only arrives after hydration, so the nav would paint and then vanish,
  or pop in, on every `/` load.
- **Redirect a signed-out `/` to `/welcome`.** That's an extra round trip, and
  the URL people share and bookmark would change.
- **Have `/` render the shell itself** (no groups). It leaves the auth pages'
  pathname list in place.

## Consequences

- No pathname lists, CSS markers or `:has()` rule decide the frame.
  `ROUTES_WITHOUT_NAV`, `data-app-shell` and `data-without-app-shell` are gone.
- `"/"` is not in `PUBLIC_PATHS`. It's handled before the gate, so
  `requiresAuth("/")` is true again, and `safeRedirectPath` no longer needs a
  special case for it.
- A signed-out and a signed-in `/` are different documents at one URL. Any
  cache in front of `/`, including the service worker, must not share them
  across sessions. This is the existing service-worker private-data concern,
  not a new one.
- A new top-level route has to pick a group. A page added outside both groups
  gets the bare root layout: no nav and no column.

## Amendment, 2026-11-17: the app moves to `/stuff`

**What changed.** The Stuff screen moved from `(app)/page.tsx` to
`(app)/stuff/page.tsx`, at `/stuff`. The marketing home moved from
`(public)/welcome/page.tsx` to `(public)/page.tsx`, so it is the real `/`.
`/welcome` is gone outright (it was never deployed, so no redirect). Both paths
are named once, in `src/lib/routes.ts` (`STUFF_PATH`, `MARKETING_PATH`), and
`src/__tests__/route-constants.test.ts` fails on a literal that bypasses them.

`resolveRoute` now decides:

- signed in and `/` → **redirect** to `/stuff`, keeping the query string, so an
  old `/?q=keys` link still searches;
- signed out and `/` → the marketing home, a public page like the auth pages;
- signed out and `/stuff` → `/sign-in?next=/stuff`, like every protected page;
- everything else as before. The `rewrite` decision is gone.

The default landing after sign-in (`DEFAULT_REDIRECT_PATH`) and the manifest's
`start_url` are both `/stuff`.

**Why.** "Two different documents at one URL" was listed above as a
consequence. In practice it was a source of bugs, and two have already been
patched one at a time:

- 101bdc1: the client router reused a signed-out prefetch of `/` after sign-in
  and showed a signed-in user the marketing page. `/welcome` had to render per
  request to stop it.
- ADR 0014: the service worker's `others` cache is keyed by URL, so `/` held
  whichever version was fetched last.

Every cache keyed by URL has the same problem, so patching each one doesn't
end it. Giving each document its own URL does. It also lets the installed PWA
open straight into the app (or into sign-in, which returns there), not the
marketing page.

**How this squares with "Rejected" above.** That section rejected moving the
*marketing page* off `/`, because of the extra round trip and because the URL
people share would change. Moving the *app* instead keeps the shared URL: `/` is
still the marketing home. The cost moves to signed-in users. Typing the bare
domain while signed in costs one redirect. The installed app, in-app links and
sign-in all go straight to `/stuff`.

**Still true.** `/` answers differently by cookie (a page or a redirect), so
`(public)/page.tsx` keeps `await connection()` and renders per request. That
reason, and the sample rows' request-time dates, are why `/` isn't static.
Making it fully static would need those dates computed on the client. That is
not done here.
