# Deploying Stuff Locator

How to put this repo on Vercel with a production Supabase project. This file
makes the repo **ready** to deploy. Nothing here has been deployed yet: no
Vercel project, no production Supabase project and no real secrets exist.
Those steps are manual and listed below.

Checked on 2026-11-17 against Next.js 16.3.5, `@supabase/ssr` 0.12, Supabase
CLI 2.117 and the Vercel and Supabase docs of that date.

## 1. Production Supabase project

Use a **separate** Supabase project for production. The local stack
(`npm run supabase:start`) is for development and tests only.

1. **Create the project** in the Supabase dashboard. Pick the region nearest
   to the people using it. Save the database password in a password manager.
2. **Link and push the migrations from this repo.** Never create or change
   tables in the dashboard: the schema, RLS policies, grants and functions
   all live in `supabase/migrations/` (CLAUDE.md, ADR 0005).

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # asks for the database password
   npx supabase db push --dry-run                  # lists the migrations it will apply
   npx supabase db push
   ```

   Run `db push` again after every merged migration, **before** deploying
   the code that needs it.

3. **API keys** (Project Settings → API Keys). Use the **publishable key**
   (`sb_publishable_…`) as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`:
   - **Why:** Supabase is deprecating the legacy JWT `anon` and
     `service_role` keys by the end of 2026, and its Next.js guide now uses
     the publishable key.
   - **Checked locally:** the publishable key works through the existing
     variable with this repo's `@supabase/supabase-js`. Sign-up and
     authenticated reads succeed. Anonymous table reads are refused by
     Postgres, as ADR 0005 intends.
   - **The variable was renamed** from `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     on 2026-11-17, so the name says what it holds. CI feeds the app the
     local stack's publishable key too, so CI runs what production runs.
     After pulling this change, rename the line in your own `.env.local`.
   - **The secret key (`sb_secret_…`) never goes to Vercel.** The app has no
     use for it at runtime: every privileged write is a `SECURITY DEFINER`
     function called with the user's own JWT.
   - **Once the app runs on the publishable key, disable the legacy keys** in
     the same settings page.

## 2. Auth settings (Authentication → URL Configuration)

| Setting | Value |
| --- | --- |
| Site URL | `https://<production-domain>` |
| Redirect URLs | `https://<production-domain>/reset-password` |
| (for previews) | `https://*-<vercel-team-slug>.vercel.app/**` |

Where these come from in the code:

- **Password reset.** `forgot-password-form.tsx` calls
  `resetPasswordForEmail` with `redirectTo: ${origin}/reset-password`.
  Supabase only honours a `redirectTo` that is on the allow-list. Otherwise it
  silently falls back to the Site URL and drops the path, so the reset page
  never opens. This is the one redirect URL the app needs.
- **Sign-up confirmation.** Off in production (below), so no email and no
  redirect. If it's ever turned on: `signUp` passes no `emailRedirectTo`, so
  the link lands on the **Site URL**.
- **Invite links (`/join/[code]`).** These are not an auth redirect, so they
  need no allow-list entry. `invite-panel.tsx` builds them from
  `window.location.origin`, so a link made on a preview deployment points at
  that preview.

**Email confirmation: turn it off** (Authentication → Sign In / Providers →
Email → "Confirm email"). Decided 2026-11-17: this is a portfolio demo that
people will try, so sign-up signs you straight in, as it does locally
(`enable_confirmations = false` in `supabase/config.toml`). Supabase-hosted
projects default to **on**, so this is a step to take, not a default to keep.

- **The trade-off:** anyone can register with an address that isn't theirs.
  The harm here is small: an account sees only its own household, and
  joining someone else's takes their invite code.
- **If it's ever turned on:** the confirmation link lands on the Site URL,
  and there is no `/auth/confirm` route, so the person confirms and then
  signs in by hand. The sign-up form already handles that ("Check your
  email…, then sign in"). That flow hasn't been tested against a hosted
  project.

### Custom SMTP (Authentication → Emails → SMTP Settings)

**Set this up before real use.** Supabase's built-in sender:

- **delivers only to addresses in the project's team.** Anyone else gets
  "Email address not authorized";
- **is limited to 2 messages per hour**, and Supabase says that limit "can
  change without notice";
- **has no SLA.** Supabase says it is for non-production use and urges a
  custom SMTP server for everything else.

Password reset sends email even with confirmation off, so SMTP is still
needed.

**Provider: Resend (decided 2026-11-17).**

- **Free plan:** 100 emails a day and 3,000 a month. With confirmation off,
  only password resets send mail, so a couple's app stays far below that.
- **No surprise bills:** sending pauses at the cap, and nothing is charged.
- **Supabase integration:** Resend has a built-in one that creates the key
  and fills in these settings.

**Prerequisite: a domain of your own. There isn't one yet.**

- Resend delivers to other people's inboxes only from a domain you've
  verified with DNS records.
- `*.vercel.app` can't be verified, because Vercel owns it.
- Until a domain is verified, Resend sends only to your own account
  address.
- Sending "from" a Gmail address through any provider fails Gmail's DMARC
  check.
- So, until there is a domain, password reset works only for addresses in
  the Supabase team, at 2 emails an hour.

Steps, once there's a domain:

1. Buy the domain, and add it to the Vercel project (Settings → Domains).
2. In Resend, go to Domains → Add, and add the DNS records it lists (SPF,
   DKIM, and optionally DMARC) at your DNS host. Wait for Resend to show
   "Verified".
3. Connect Resend to Supabase, either with Resend's Supabase integration
   or by hand in SMTP Settings:

   | Field | Value |
   | --- | --- |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | a Resend API key with sending access (keep it out of the repo) |
   | Sender email | e.g. `no-reply@<your-domain>` |
   | Sender name | `Stuff Locator` |

4. Raise the email rate limit under Authentication → Rate Limits. It stays
   at the built-in sender's low value until you change it.
5. Change the Site URL and Redirect URLs (above) to the new domain.

Other providers (Postmark, Amazon SES, SendGrid, Brevo) work the same way,
and every one of them needs a verified domain too.

## 3. Vercel project

1. **Add New → Project, and import the GitHub repo.**
2. **Framework preset: Next.js**, which is auto-detected. Leave the root
   directory, install command and output directory at their defaults.
3. **Build command: the default, `npm run build`.** npm runs `prebuild`
   first, and that matters: `scripts/copy-ort.mjs` copies onnxruntime-web's
   wasm into `public/ort/<version>/`. That folder is gitignored, so it only
   exists if the build creates it. Verified in a fresh `git clone`: before
   the build `public/ort/` does not exist, and after `npm ci && npm run build`
   it holds the 4 runtime files and the build passes.
4. **Node.js version: 24.x, nothing to set.** `package.json` pins
   `"engines": { "node": "24.x" }`, and Vercel takes the version from there
   (it overrides the dashboard setting). CI runs the same major. Node 24 is
   the current LTS and Vercel's default. To change it, change `engines` and
   `node-version` in `.github/workflows/ci.yml` together.
5. **Environment variables** (Production, and Preview if previews should
   work):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the **publishable** key (see 1.3) |

   That's all the app reads (`src/lib/env.ts` validates both at start-up).
   Both are `NEXT_PUBLIC_`, so they are inlined into the client bundle
   **at build time**. Changing one needs a redeploy, not just a restart.

   Previews pointed at the production project share its data. A second
   Supabase project for previews avoids that.

6. **Deploy.** Then run the checks in §5 against the production URL.

## 4. What production depends on, and what was checked

### Service worker and PWA (checked under `npm run build && npm run start`)

- **The worker** is served from `/serwist/sw.js`, built at build time by the
  route handler in `src/app/serwist/[path]/route.ts`.
- **Precache:** 50 entries (~2 MB), covering the app shell, icons and
  `/~offline`. `public/ort/` is excluded, because transformers.js caches the
  runtime itself.
- **Precache revision.** It comes from `VERCEL_GIT_COMMIT_SHA` on Vercel,
  else `git rev-parse HEAD`, else a random id. Before this change the build
  read only `git`: it **crashed** if git wasn't installed, and made
  `/~offline` re-download on every deploy if there was no `.git` directory.
- **`/~offline`** is precached and shows when a page isn't cached.
- **Manifest** at `/manifest.webmanifest` (`application/manifest+json`):
  name, `start_url: /stuff`, `display: standalone`, theme and background colours,
  and 192, 512 and 512-maskable icons, all returning 200. That covers
  Chromium's installability criteria (a manifest with those fields and
  icons, a service worker with a fetch handler, HTTPS). On a deployment,
  confirm in DevTools → Application → Manifest that no installability
  errors are listed.
- **Runtime caching and its privacy rules** are in ADR 0014. Visited pages
  work offline mid-session, and everything household-related is cleared at
  sign-out.

### The `/ort/` wasm (~27 MB): is it compressed?

**Yes, on Vercel too.**

- Vercel's CDN compresses responses whose MIME type is on its allow-list,
  and `application/wasm` is on it. Brotli is used when the browser offers
  it, otherwise gzip ([Vercel CDN Compression](https://vercel.com/docs/how-vercel-cdn-works/compression)).
- **Locally**, `next start` already serves it gzip-encoded.
- **Measured** for the file transformers.js actually loads
  (`ort-wasm-simd-threaded.asyncify.wasm`): 25.6 MB raw → 6.4 MB gzip →
  3.8–4.7 MB Brotli (quality 11 vs 5; the CDN's level isn't documented).
- **To confirm on the first deploy:**
  `curl -sI -H 'Accept-Encoding: br, gzip' https://<domain>/ort/<version>/ort-wasm-simd-threaded.asyncify.wasm`
  should show `content-encoding: br`.
- **Cache-Control.** Vercel serves `public/` files with
  `public, max-age=0, must-revalidate`, so the browser revalidates. That
  matters little here: transformers.js keeps the wasm in Cache Storage keyed
  by the versioned URL. An `immutable` header for `/ort/:path*` in
  `next.config.ts` would be a small optional improvement.

### `onnxruntime-node` and `sharp`

`@huggingface/transformers` declares both as hard dependencies, not optional.

- **Neither lands in a serverless function because of transformers.** The
  only import of `@huggingface/transformers` is the embedding web worker
  (`src/lib/search/embedding.worker.ts`). It resolves the package's browser
  build, and the build's file traces (`.next/**/*.nft.json`) contain no
  `onnxruntime` or `@huggingface` file. `sharp` is traced only through
  Next's own image optimizer (`next-server.js.nft.json`); Next depends on it
  directly, and Vercel optimizes images on its own infrastructure anyway.
- **The install, though, is heavier than it needs to be.**
  `onnxruntime-node` is about 300 MB unpacked: native binaries for every
  platform, never used here. `node_modules` totals about 1.1 GB. A warm
  `npm ci` took 5.9s locally. A cold one on Vercel will be slower, and
  Vercel's build cache keeps it from repeating on every deploy.
- **Proposal (not done):** nothing is needed for correctness.
  - `serverExternalPackages` doesn't apply, because nothing on the server
    imports the package.
  - If install time becomes a problem, an npm `overrides` entry can point
    `onnxruntime-node` at an empty local stub package (`file:` spec). That
    removes ~300 MB, but it breaks any future server-side use of
    transformers, so it's a trade-off to make deliberately.

### The embedding model: served from Hugging Face

**Decided 2026-11-17 (Itamar): not self-hosted.** The browser downloads the
model from the Hugging Face Hub, pinned to commit
`751bff37182d3f1213fa05d7196b954e230abad9` (`MODEL_REVISION`, ADR 0012), so
nothing about it touches the build or the deployment. About 23.7 MB in total
(`model_quantized.onnx` 22.97 MB plus `tokenizer.json` 0.71 MB). It downloads
once per browser and is cached by transformers.js after that.

What this means in practice:

- If Hugging Face is down or slow, Find falls back to the word-matching
  (lexical) ranking. Search keeps working, just without matching on meaning.
- The model downloads on the first search, or in the background on a fast
  connection (ADR 0012), never on Save-Data or 2g.
- To self-host later: download the pinned files at build time into a
  gitignored `public/` folder (like `/ort/`), or commit them (~24 MB, Git LFS
  advisable). Then point `src/lib/search/model-hosts.ts` and
  `env.remotePathTemplate` at this origin, and widen the model exception in
  `sw.ts` to the new path.

## 5. After the first deploy

- [ ] `/` signed out shows the marketing home. Sign up with a new address:
      you land on `/stuff` straight away, with no "check your email" step
      (confirmation is off). Opening `/` again while signed in redirects
      to `/stuff`.
- [ ] Forgot password → the email arrives (custom SMTP) → the link opens
      `/reset-password` on the production domain.
- [ ] Invite partner → the `/join/<code>` link opens on the production domain.
- [ ] DevTools → Application: the manifest has no installability errors,
      and the service worker is activated.
- [ ] The `/ort/…wasm` response has `content-encoding: br` (see §4).
- [ ] Sign out, then check Cache Storage: no `pages-rsc*` / `others`
      entries for household pages (ADR 0014).

## 6. Supabase Free plan: what matters here

- **Projects pause after 7 days of low activity.** "A few user requests to
  the database each day" is enough to prevent it. A paused project can be
  restored from the dashboard for up to a year
  ([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
  For a couple's inventory used now and then, expect pauses. Upgrade to a
  paid plan, which never pauses, if it has to be always on.
- **Two active Free projects per account.** Production and a preview
  project would use both.
- **Paused means down.** Sign-in fails until the project is resumed. The
  service worker shows cached pages, if any, or `/~offline`.

## Out of scope here

These are manual steps for whoever deploys:

- creating the Vercel project;
- creating the production Supabase project and running `db push`;
- setting real secrets;
- configuring SMTP;
- choosing the domain.
