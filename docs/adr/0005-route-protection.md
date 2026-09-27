# 5. Route protection

**Status:** Accepted

## Context

Until now, every real-data page carried its own auth check — a
`createClient()` / `auth.getUser()` / `redirect("/sign-in")` preamble
copy-pasted into seven page components as each one got wired off its
fixtures. That worked, in the sense that each page that had the check was
protected. The problem is what it does to the pages that don't.

`/activity` is the proof. It's still fixture-backed, so nobody wiring it
had a reason to add an auth check, and it shipped reachable by anyone with
the URL. Nothing anywhere failed: not a test, not a type, not a lint rule.
The check being per-page means "is this route protected?" is only ever
answered by someone remembering to ask.

The second gap was smaller but more visible: every check redirected to a
bare `/sign-in`, and every successful sign-in went to `/`. A link to a
specific item, shared between partners, sent the recipient through sign-in
and then dumped them on Home with no idea what they'd been sent.

## Decisions

**Deny-by-default in `src/proxy.ts`, with an explicit public allowlist.**
`src/lib/route-access.ts` names the four auth routes and the `/join/`
prefix; `requiresAuth()` returns true for everything else. The property
that matters is the inverse of the old one: a route added next month is
protected because it exists, not because someone remembered. The eight
routes this task's AC lists are covered by the rule rather than
one-by-one, and so is `/settings/invite`, which the AC doesn't mention but
which reads real household data.

The proxy was already running on every request to refresh the Supabase
session cookie, so this adds a branch to an existing hop rather than a new
one.

**The per-page `getUser()` checks stay.** Next's own guidance
(`app/guides/authentication`, "Optimistic checks with Proxy") is explicit
that proxy is a pre-filter, not an authorization boundary — it runs on
prefetches, it reads a cookie, and historically middleware-level auth has
been bypassable (CVE-2025-29927). The pages also need the `user` object
for their own RLS-scoped queries, so the check isn't redundant work; it's
the same call they were already making. The proxy catches the route
early and centrally, the page proves identity before touching data, and
Postgres RLS is the actual enforcement boundary underneath both.

The one route protected *only* by the proxy is `/activity`, which renders
fixtures. If the proxy were bypassed entirely, what leaks is `ITEMS` from
`src/lib/fixtures/` — no household data exists on that page to expose.

**`/api/*` is exempt from the gate, not made public.** Route handlers
return their own status codes; `POST /api/household/bootstrap` already
answers a signed-out caller with `401` JSON. Redirecting it to `/sign-in`
would hand its `fetch()` a `307` and an HTML document where the client
code branches on a status.

**`/join/[code]` is public.** The invite landing resolves whether the
visitor has a session and hands that to `JoinInviteFlow`, which shows a
sign-up/sign-in toggle to a logged-out one. Gating it would break every
invite link for exactly the person it was sent to — the recipient, who by
definition doesn't have an account yet.

**Return-to via `?next=`, validated at the page boundary.** The proxy
attaches the intended path when it bounces someone; `/sign-in` and
`/sign-up` read it server-side and hand it to their form. It's threaded
through sign-up as well as sign-in, so following "create an account" from
a bounced sign-in doesn't quietly lose the destination.

The param is attacker-controllable — it's a query string on a public page
— so `safeRedirectPath()` rejects anything that isn't a same-origin
absolute path before it reaches `router.push()`. Without that, a crafted
`/sign-in?next=https://evil.example` is an open redirect wearing this
app's sign-in page as the referrer. Protocol-relative forms (`//host`,
`/\host`) and embedded control characters are rejected specifically
because they start with `/` but don't stay on this origin.

**The root domain for a logged-out visitor is the sign-in page.** `/` is
protected like everything else, so a logged-out visitor lands on
`/sign-in` — there is no separate marketing page. A portfolio reviewer
makes an account in a few seconds and sees the real app, which is the
point of the project. This is a product decision made here rather than in
the Design Journal, and it's reversible: a public landing page would be a
new route added to the allowlist, not a rework of this.

## Consequences

- `/~components`, the unlinked component catalog, is now behind the
  session gate like everything else, and additionally `notFound()`s when
  `NODE_ENV === "production"`. It's a dev tool with no audience on a
  deployed build. That also 404s it under `npm run build && npm run
  start`; no spec visits it.
- An authenticated visitor hitting `/sign-in` is *not* bounced to `/`.
  Keeping those routes reachable with a session is the current behaviour
  and nothing asked for the reverse redirect; it'd be a small follow-up.
- `e2e/activity.spec.ts` had to start signing in, because the route it
  tests was genuinely unprotected before this. Two entries in
  `e2e/accessibility.spec.ts` needed the same treatment, and that one is
  worth noting as a trap: an axe scan of a route that now redirects
  doesn't fail, it silently scans the sign-in page and passes.

## Known limitations

**The per-page fallback redirects drop the return-to.** The seven pages
that still call `redirect("/sign-in")` after their own `getUser()` do so
without a `?next=`. That path only runs when the cookie's claims verify
but `getUser()` then fails — a revoked session, a deleted user, a sign-out
from the partner's device mid-navigation. Reconstructing the current path
inside a Server Component means plumbing it through a header from the
proxy, which is more machinery than a rare race deserves; the proxy is
what handles every ordinary case. Worth revisiting if it ever shows up in
practice.

**`getClaims()` failing closed is a deliberate choice, and now a logged
one.** An unverifiable cookie counts as signed out. With asymmetric
signing keys verification is local after the JWKS is cached, so this is
rare; under the legacy shared-secret mode it's a network call per request
and an auth-server blip would bounce a signed-in user to `/sign-in` with
no explanation. It now logs server-side so the two cases are
distinguishable in the logs.

**The service worker qualifies "protected" for offline visitors.**
`src/app/sw.ts` uses serwist's `defaultCache`, which is NetworkFirst for
documents, so an offline visitor can be served a previously-cached
authenticated page after signing out. Pre-existing PWA behaviour, not
introduced here, but it means "protected" describes the network path, not
the device's disk.
