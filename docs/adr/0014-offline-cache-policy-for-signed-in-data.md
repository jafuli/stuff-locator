# 14. Offline cache policy for signed-in data: keep it mid-session, clear it when the session ends

**Status:** Accepted, 2026-11-17. Fixes the "Service worker caches private
household data" task (Notion). Builds on ADR 0012 (the service worker's model
and `/ort/` exceptions, unchanged here) and ADR 0006 (route protection).

## Context

The service worker used Serwist's `defaultCache`. In a production build that
stores, for up to 24 hours (`node_modules/@serwist/turbopack/dist/index.worker.mjs`):

| Cache                | What                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `pages-rsc-prefetch` | RSC prefetches (`RSC: 1` + `Next-Router-Prefetch: 1`)                |
| `pages-rsc`          | RSC payloads for client navigations                                  |
| `pages`              | requests whose *request* `Content-Type` is HTML (in practice, none)  |
| `others`             | every other same-origin GET, which includes documents                |
| `apis`               | same-origin `GET /api/*`                                             |
| `cross-origin`       | every cross-origin GET, including Supabase REST and `/auth/v1/user`  |

Nothing cleared them. After sign-out, the previous user's items, places,
household name and activity stayed in Cache Storage and rendered offline for
whoever used the device next.

Itamar's constraint: keep link prefetching, and keep the app usable when the
connection drops mid-session. So the fix is to scope and clear the caches, not
to stop caching.

## Decision

### 1. Runtime caching is declared in the repo

`src/lib/offline/runtime-caching.ts` replaces `defaultCache`, so every cache
name the worker writes is one this repo owns:

- **Static assets** (fonts, images, JS, CSS) keep Serwist's rules, names and
  limits. They hold no household data and survive sign-out. The audio/video,
  Google Fonts, `/_next/data` and `.json/.xml/.csv` rules are dropped as
  unused.
- **Pages** (`pages-rsc-prefetch`, `pages-rsc`, `others`) stay NetworkFirst:
  the cache is read only when the network fails. This is what keeps offline
  browsing mid-session working.
- **Never cached:** every cross-origin request, and `/api/*`.

`src/lib/offline/cache-policy.ts` lists the private cache names: the three
above, plus `pages`, `apis` and `cross-origin`, which are no longer written
but stay on the list so an install that ran the old worker is purged too. A
unit test fails if a rule writes to a cache that is on neither the private
list nor the static list.

Documents stay in `others`, as before. Two writers share it: a navigation,
and `SerwistProvider`'s `cacheOnNavigation`, which re-fetches the URL of every
client-side navigation as a plain request. That re-fetch is what lets a
visited page load offline as a document. A first draft of this change routed
navigations to `pages` and broke exactly that (measured): documents were
written to one cache and read from the other.

### 2. Supabase in the browser: NetworkOnly

The browser's own Supabase reads are the household menu (`household_members`)
and onboarding (`households`, `locations`). All screen data reaches the
browser as RSC from the server, and that is what the page caches above
store. Caching the Supabase GETs would buy nothing offline (the household
menu offline is only useful for Invite and Sign out, which need the network
anyway), would keep another copy of household data, and would cache auth
responses (`/auth/v1/user`), which must never come from cache. So they are
NetworkOnly, and the old `cross-origin` cache is still cleared.

### 3. Clearing: when the session ends or changes hands

`clearPrivateCaches()` (`src/lib/offline/clear-private-caches.ts`) does two
things at once:

- **It posts `CLEAR_PRIVATE_CACHES` to the controlling worker**, which bumps
  an epoch counter, deletes the caches, and replies.
- **It calls `caches.delete` from the page**, for a page no worker controls
  yet, or one controlled by an older worker.

It never rejects, and waits at most 1.5s for the reply, so a missing worker,
a missing Cache API or private mode can't block signing out.

Callers:

- **The Sign out button** awaits it after `auth.signOut()` succeeds and
  before `router.push("/sign-in")`. If `signOut()` fails, the session is
  still there and nothing is cleared.
- **`PrivateCacheGuard`** (root layout) listens to `onAuthStateChange` and
  applies `decideCacheClear`:
  - no session clears;
  - a session for someone other than the last user seen on this device
    (`localStorage`) clears;
  - the same user again does nothing.

### 4. In-flight requests can't refill a cleared cache

`src/lib/offline/epoch-guard.ts` is a Serwist plugin on every private-cache
strategy:

- **The request's epoch is recorded when it starts.** Its write is refused
  if the epoch moved by the time the response arrives (`cacheWillUpdate`),
  and deleted if the clear landed between that check and the write
  (`cacheDidUpdate`).
- **Non-200 responses are never cached.** Serwist adds this check itself
  only when no plugin defines `cacheWillUpdate`, so the guard repeats it.
- **Redirected responses are never cached either.** Measured: right after
  sign-out, the still-mounted Stuff screen re-prefetches its item links, the
  proxy redirects each to `/sign-in`, and the fetch follows the redirect to a
  200. Without this check, that payload was stored under the item's URL. It
  held no household data, but it leaked the item id and served the wrong
  page.

## Session endings covered

| How the session ends                                  | Cleared by                                      |
| ----------------------------------------------------- | ----------------------------------------------- |
| Sign out button (household sheet)                     | the button, before redirecting; the guard too   |
| Refresh token fails or the session expires (tab open) | guard (`SIGNED_OUT`)                            |
| Sign out in another tab                               | guard: supabase-js relays `SIGNED_OUT` to tabs  |
| A different user signs in on this device              | guard (user id differs from the last seen)      |
| Cookie expired or removed while the app was closed    | guard, on the next online load (no session)     |

**Not covered:**

- **An offline cold start with an expired session.** The worker serves cached
  pages before any script runs, and supabase-js can't confirm the session is
  gone without the network. This is bounded by the caches' 24h expiry.
- **Site data partly cleared by the browser** (cookies gone, caches kept).
  The caches go on the next online load.

## Measured offline behaviour (production build, Chromium, 2026-11-17)

Setup: signed in. The Stuff screen loaded with its links prefetched, one item
opened, then Browse, one place and Activity visited by client navigation.
Then the connection was dropped.

| Page                                         | Client navigation | Document load (reload / URL) |
| -------------------------------------------- | ----------------- | ---------------------------- |
| Stuff (`/`), and search on it                | renders           | renders                      |
| A visited item                               | renders           | renders                      |
| An item that was only prefetched             | `/~offline`       | `/~offline`                  |
| Browse (`/browse`, visited)                  | renders           | renders                      |
| A visited place                              | renders           | renders                      |
| A place that was only prefetched             | `/~offline`\*    | `/~offline`\*               |
| Activity (visited)                           | renders           | renders                      |
| Stash (not visited)                          | `/~offline`       | `/~offline`                  |
| Item edit, Invite (not visited)              | not measured      | `/~offline`                  |

\* Inferred, not cleanly measured: `/browse/[id]` has the same `loading.tsx`
boundary as `/items/[id]`, but the run's click on an unvisited place started
from the `/~offline` page and timed out.

Search works offline: it runs in the page, on the list already rendered,
using the lexical ranking (the semantic one too, if the model had loaded).

**Why a prefetched-only item doesn't open offline.** Next 16 prefetches a
dynamic route only partially when it has a `loading.tsx`
(`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`).
`/items/[id]` and `/browse/[id]` both do, so the prefetch carries the shared
layout and the loading skeleton but not the item. The click then needs a
network request for the data, and offline that request fails, so the page
falls back to `/~offline`.

**Fuller prefetch (not built).** Making unvisited items work offline would
take:

- `<Link prefetch={true}>` on item and place links;
- Partial Prefetching (`partialPrefetching`, or `prefetch = 'partial'` on
  those segments), with the item read made cacheable (`"use cache"`, keyed
  per user);
- the cost: one server render per visible link, which is ~24 requests at
  seven items today.

That is a product decision about cost versus offline reach, so it's flagged
here, not made.

## Consequences

- Offline mid-session works for what the person has already looked at, and
  for nothing else.
- Signing out costs that offline history, and the next sign-in starts with
  empty page caches. The precache (`/~offline`, the app shell) and
  `transformers-cache` (the ~23 MB model) are kept.
- A new runtime cache must be added to the private list or the static list.
  The unit test enforces this.
- The fetch-listener exceptions in `sw.ts` (worker entry scripts, the model,
  `/ort/`) are unchanged (ADR 0012).
