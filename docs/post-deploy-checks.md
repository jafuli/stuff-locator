# Post-deploy checks

How to check by hand that a production deploy of Stuff Locator works. It takes
about 10 minutes. Run it after the first deploy, and again after any deploy
that changes migrations, auth, the service worker, search or the build.

The list in [DEPLOYMENT.md §5](../DEPLOYMENT.md#5-after-the-first-deploy)
says *what* to check. This page says *how*, what a pass looks like, and what
a failure points to.

Production: <https://stuff-locator.vercel.app> (Vercel team
`itamarbadash-3143s-projects`, Supabase project `lkumnzgjvjvovdinpqwd`,
Frankfurt).

## What you need

- A Chromium browser with DevTools. Use a **private window**, so an old
  service worker or cache doesn't hide a problem.
- A terminal with `curl`.
- **The standing check account**: a `+deploycheck` alias of your own
  address, with the password in the password manager. Reuse it every time rather than
  signing up a new one: an account that has added an item or made an invite
  can't simply be deleted (see [Cleanup](#cleanup)). Sign-up itself is
  checked once, on the first deploy, or with a fresh `+alias` when auth
  changes.

## 1. The deployment (Vercel dashboard)

| Check | Where | Pass |
| --- | --- | --- |
| Latest production deploy is **Ready** and built from `main` | Project → Deployments | the commit SHA matches `git rev-parse origin/main` |
| Functions run next to the database | Settings → Functions → Function Region | **Frankfurt (fra1)**. The build itself runs in `iad1`, which is fine |
| The wasm was copied at build time | the deploy's Build Logs | a line `copy-ort: onnxruntime-web <version> -> public/ort/<version>/ (4 files)` |
| Only the two public variables are set | Settings → Environment Variables | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, nothing else, and **no secret key** |
| No server errors | Logs, or Observability → Errors | none since the deploy |

## 2. Database privileges (terminal)

Anonymous requests must be refused by the privilege check, not filtered by
RLS ([ADR 0005](adr/0005-data-api-privileges.md)):

```bash
K=<publishable key>; U=https://lkumnzgjvjvovdinpqwd.supabase.co
for t in households household_members locations items invites profiles activity_events; do
  printf "%-18s" $t; curl -s "$U/rest/v1/$t?select=*&limit=1" -H "apikey: $K"; echo
done
```

**Pass:** every line says `"code":"42501"` and `permission denied for table …`.

**Fail:** any `[]`. That means a grant leaked and RLS is the only thing in
the way. Check whether a new table was left out of the explicit grants, and
whether the project was created with "Automatically expose new tables"
**on**.

## 3. Signed out

1. Open `/`. **Pass:** the marketing home, "Where did we put the passports?".
2. Open `/join/<any code>`. **Pass:** "Join a household" with a sign-up form.
3. *(First deploy, or after an auth change.)* Sign up with a fresh `+alias`.
   **Pass:** you land on `/stuff` (or onboarding) straight away, with no
   "check your email" step, because confirmation is off.
   **Fail:** "Check your email…" means **Confirm email** got switched back on
   in Supabase.

## 4. Signed in

Sign in with the check account.

1. **Redirect.** Open `/?from=check`. **Pass:** the URL becomes
   `/stuff?from=check`, so the proxy redirects and keeps the query.
2. **Stash.** Go to Stash and add an item with a *new* two-level place, for
   example `Bedroom › Desk drawer`. **Pass:** "Added", with both levels shown.
   This exercises `stash_item` and `ensure_location_path`, the locked write
   path. **Fail:** an error toast usually means a migration wasn't pushed:
   run `npx supabase db push --dry-run` and see if anything is pending.
3. **Activity.** Open Activity. **Pass:** "… added <item> in BEDROOM ›
   DESK DRAWER", read from `activity_events`.
4. **Find, word matching.** On `/stuff`, search `pasport`. **Pass:**
   Passport is the top row with **CLOSEST**.
5. **Find, meaning.** Search `travel documents`. On a cold browser the model
   downloads first (~24 MB from Hugging Face), so you may see "Still looking"
   for a few seconds. **Pass:** Passport appears with **≈ matched on
   meaning**. **Fail:** only "No matches" after ~15 s. Look in the Console
   for errors from Hugging Face or from `/ort/`.
6. **Invite.** Household menu → Invite partner. **Pass:** the link starts
   with `https://stuff-locator.vercel.app/join/`. On a preview deployment it
   starts with that preview's origin instead, which is expected.

## 5. PWA (DevTools → Application)

1. **Manifest:** name "Stuff Locator", start URL `/stuff`, display
   `standalone`, three icons, and **no installability errors** listed.
2. **Service workers:** `/serwist/sw.js`, status **activated**.
3. **Cache storage:** `serwist-precache-v2-…` holds about 50 entries. The
   `/~offline` entry's `__WB_REVISION__` equals the deployed commit SHA,
   which shows the build read `VERCEL_GIT_COMMIT_SHA`.

## 6. Wasm compression (terminal)

```bash
curl -sI -H 'Accept-Encoding: br, gzip' \
  https://stuff-locator.vercel.app/ort/<version>/ort-wasm-simd-threaded.asyncify.wasm
```

`<version>` is the one in the build log line from §1.

**Pass:** `content-type: application/wasm` and `content-encoding: br`.
Measured on 2026-11-17: 26.9 MB raw, 6.0 MB on the wire. That's above the
3.8–4.7 MB local Brotli estimate in DEPLOYMENT.md §4, so the CDN uses a
lower Brotli level, but it's still compressed.

## 7. Caches are cleared on sign-out

[ADR 0014](adr/0014-offline-cache-policy-for-signed-in-data.md): household
pages must not outlive the session.

1. While signed in, visit `/stuff`, an item and Activity.
2. Sign out (Household menu → Sign out).
3. In the Console, list what's left in the page caches:

   ```js
   for (const k of ["others", "pages-rsc", "pages-rsc-prefetch"]) {
     const c = await caches.open(k);
     console.log(k, (await c.keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search));
   }
   ```

**Pass:** only public pages are left: `/sign-in`, `/sign-up`, `/`,
`/forgot-password`. These are written again *after* the clear, because the
sign-in page and its links are fetched right away. Keys like
`/sign-in?next=%2Fitems%2F<id>` are fine: the body is the sign-in page. Only
the item's ID is in the URL.

**Fail:** any `/stuff`, `/items/…`, `/browse…` or `/activity` key without
`/sign-in` in front of it.

`transformers-cache` (the model) and the `static-*` caches are meant to stay.

## 8. Password reset

**Blocked until custom SMTP is set up** (DEPLOYMENT.md §2). Until then
Supabase's built-in sender delivers only to members of the Supabase team,
at 2 emails an hour.

Once SMTP works: Forgot password → the email arrives → the link opens
`https://stuff-locator.vercel.app/reset-password`.

**Fail:** the link opens `/` instead. That means `/reset-password` isn't
in Supabase's Redirect URLs, so Supabase fell back to the Site URL.

## Cleanup

Leave the check account's household as it is, and reuse it next time.

Deleting the account under Supabase → Authentication → Users **fails** once
it has added an item or made an invite. `items.added_by` and
`invites.created_by` reference `auth.users` with no `ON DELETE` action, so
Postgres refuses to delete the user. There is no account-deletion flow in
v1. If one is ever needed, it's a migration and a decision, not a dashboard
click.

## Last run

| Date | Commit | Result | Notes |
| --- | --- | --- | --- |
| 2026-11-17 | `96c8d9d` | All pass except §8 (no SMTP yet) | First production deploy. Function region `fra1`. Sign-up landed on `/stuff`. No runtime errors. |
