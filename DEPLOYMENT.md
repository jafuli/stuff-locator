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
   (`sb_publishable_…`) as the value of `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
   - **Why:** Supabase is deprecating the legacy JWT `anon` and
     `service_role` keys by the end of 2026, and its Next.js guide now uses
     the publishable key.
   - **Checked locally:** the publishable key works through the existing
     variable with this repo's `@supabase/supabase-js`. Sign-up and
     authenticated reads succeed. Anonymous table reads are refused by
     Postgres, as ADR 0005 intends.
   - **The variable name is not renamed in this PR.** A rename to
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is worth a small follow-up so the
     name matches what it holds; it touches only `src/lib/env.ts`, the two
     client factories and `.env.example`.
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
- **Sign-up confirmation.** `signUp` passes no `emailRedirectTo`, so the
  confirmation link lands on the **Site URL**. The form already handles a
  sign-up that returns no session: it says "Check your email…, then sign in".
- **Invite links (`/join/[code]`).** These are not an auth redirect, so they
  need no allow-list entry. `invite-panel.tsx` builds them from
  `window.location.origin`, so a link made on a preview deployment points at
  that preview.

**Email confirmation.** It is off locally (`enable_confirmations = false` in
`supabase/config.toml`). Supabase-hosted projects default to **on**. Decide
deliberately:

- **On** means every sign-up and every invited partner needs the email,
  which needs working SMTP (below).
- **Off** means anyone can register any address.

There is no `/auth/confirm` route, so with confirmations on, the link
confirms the address and the person then signs in by hand. That flow has not
been exercised against a hosted project.

### Custom SMTP (Authentication → Emails → SMTP Settings)

**Set this up before real use.** Supabase's built-in sender:

- **delivers only to addresses in the project's team.** Anyone else gets
  "Email address not authorized";
- **is limited to 2 messages per hour**, and Supabase says that limit "can
  change without notice";
- **has no SLA.** Supabase says it is for non-production use and urges a
  custom SMTP server for everything else.

Password reset, and sign-up confirmation if it's on, both send email. Any
transactional provider works (Resend, Postmark, SES, …). After switching,
raise the email rate limit under Authentication → Rate Limits.

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
4. **Node.js version: set 22.x** (Project Settings → Build and Deployment).
   `package.json` says `"node": ">=22.0.0"`, and Vercel resolves an
   open-ended range to its newest major (24.x). CI tests on 22. Either pin
   Vercel to 22.x, or move CI to 24 first, so production runs what CI tested.
5. **Environment variables** (Production, and Preview if previews should
   work):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **publishable** key (see 1.3) |

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
  name, `start_url: /`, `display: standalone`, theme and background colours,
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

### The embedding model: facts for the self-hosting decision

This decision is Itamar's, on the deploy task. Today the model downloads from
the Hugging Face Hub in the browser, pinned to commit
`751bff37182d3f1213fa05d7196b954e230abad9` (`MODEL_REVISION`, ADR 0012).

- **Size:**
  - `onnx/model_quantized.onnx` is 22.97 MB (21.9 MiB);
  - `tokenizer.json` is 0.71 MB;
  - the config files are a few KB.
  - ~23.7 MB in total, cached by transformers.js after the first search.
- **Self-hosting would mean one of two things:**
  - **Download the files at build time.** The build would then depend on
    the Hugging Face Hub being reachable. Pin the same revision, and serve
    them from `public/` like `/ort/` (gitignored).
  - **Commit them to the repo.** About 24 MB of binary, Git LFS advisable.
- **Either way:**
  - the model's host and path settings (`src/lib/search/model-hosts.ts`,
    `env.remotePathTemplate`) would point at this origin;
  - the service worker's model-request exception (`sw.ts`) would have to
    cover the new path;
  - and the deployment's static output grows by ~24 MB, compressed by the
    CDN.

## 5. After the first deploy

- [ ] `/` signed out shows the marketing home. Sign up, and sign in.
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
