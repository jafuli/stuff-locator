# 12. Find: embedding search in the browser, with the substring filter as the floor

**Status:** Accepted, **revised 2026-11-10** (see "Revised 2026-11-10" at the
end; it supersedes the bullets it names below). Settles the "Search" decision in
CLAUDE.md; the reasoning comes from two Design Journal entries (2026-08-16):
_Semantic search with no server: embeddings in the browser_ and _Spike: can
embeddings match two-word item names?_.

## Context

You log "passport". Three months later you search "travel documents". A
substring filter returns nothing, and so does fuzzy matching: the strings share
no characters. With 20–50 items, one failed search makes the whole app feel
broken, because its entire promise is "you'll find it". This is synonym recall,
and at this scale it is the only retrieval problem worth solving.

## Decision

A small sentence-embedding model runs **in the browser, in a web worker**, via
`@huggingface/transformers`. Items are embedded once per page load; a query is
embedded on demand and matched by cosine similarity in memory.

- **Model:** `Xenova/all-MiniLM-L6-v2`, quantised (`dtype: "q8"`, pinned so a
  library upgrade can't swap in a larger default). ~23 MB of weights (22.97 MB)
  plus ~5.5 MB of onnxruntime wasm compressed on the wire (~27 MB raw). Not a language model: a small deterministic
  encoder with no generation and no prompt.
- **Score = max(similarity to the bare name, similarity to the enriched
  string)**, where the enriched string is `name · location path · detail`. Text
  appended to a bare name is high-variance: the location path rescues "tools for
  flat pack furniture" (Allen keys live in a Toolbox) and breaks "something to
  sit on at the park" (the picnic blanket lives in a cupboard). Taking the
  better of two representations lets each query match whichever suits it. The
  spike measured 19/20 correct within the top 3 on queries sharing no words with
  their targets.
- **Ranked shortlist, never a single answer, and no score threshold.** _(Cut
  and marker revised 2026-11-10.)_ In the
  spike a correct answer scored 0.199 where a wrong one scored 0.467, so no
  cut-off separates them. The list is cut by **rank** (the best five, plus every
  substring hit), never by score, and the first row carries CLOSEST. No score is
  ever shown.
- **Substring hits are pinned first** _(replaced 2026-11-10 by rank fusion)_, then the rest in semantic order. A
  fragment like "pas" embeds to noise, so queries under three characters never
  reach the model, and a real substring hit is never buried by a fuzzy
  neighbour.
- **Vectors are ephemeral** _(memoised in memory since 2026-11-10; still never
  persisted)_. At ~6 ms per embedding the whole household
  re-embeds in well under a second, so there is no embedding column, no vector
  store, no cache invalidation and no stale vector when an item is renamed. The
  database stores text; the browser derives meaning at runtime.
- **Lazy and connection-aware** _(replaced 2026-11-10 by idle prefetch)_. Nothing is downloaded on page load. The model
  starts on first focus of (or keystroke in) the search box. `navigator.connection`
  is feature-detected (Safari and Firefox don't have it): Save-Data, `2g` and
  `slow-2g` skip the download for the session. `3g` is deliberately allowed.
- **Degrade, never block** _(the floor is typo-tolerant since 2026-11-10)_. The case-insensitive substring filter serves results
  while the model loads, when it is skipped, and permanently if it fails. The UI
  never waits on the model. While it loads, a quiet note goes to assistive tech
  only; a skipped or failed model is silent, because falling back is the design.
- **Empty state** _(a "still looking" state added 2026-11-10)_. With the model ready the list is never empty, so "No matches"
  is replaced by the wireframe's closing line, "Nothing else close. Try another
  word, or browse by place." "No matches" remains only for the fallback modes.

## Caching, and why the service worker stays out of it

transformers.js stores the model files itself, in the Cache API under
`transformers-cache`, so a second visit (and offline) needs no download.

- **The model is not in the service-worker precache.** The precache holds only
  the app shell and `/~offline`.
- **Serwist's `defaultCache` would store a second copy.** Its cross-origin
  `NetworkFirst` rule would also keep every Hugging Face and jsDelivr response in
  a `cross-origin` cache. Observed on a production build before this change: the
  weights sat in both `transformers-cache` and `cross-origin`. `src/app/sw.ts`
  now lets requests to the model hosts pass straight through (no `respondWith`),
  so the browser fetches them natively and only `transformers-cache` holds them.
  The hosts are `huggingface.co` / `*.hf.co` for the model and (since
  2026-11-10) this app's own `/ort/` for the wasm runtime, which used to come
  from `cdn.jsdelivr.net`; `src/lib/search/model-hosts.ts` is the single list.
- **Worker entry scripts also pass through.** Turbopack gives a worker its
  bootstrap config in the URL fragment (`worker.js#params=…`). A service-worker
  response has a fragment-less URL, which the browser adopts as the worker's own
  location, so the worker boots without config and dies with "Missing worker
  bootstrap config". Without this the feature is dead in production. The
  worker is therefore a classic worker (Turbopack's wrapper builds it as one),
  and `e2e/home-semantic-search.spec.ts` guards the fix.

## Alternatives considered

| Approach                       | Why not                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| Fuzzy matching (Fuse.js)       | Fixes typos and partials, not synonyms: "travel documents" still finds nothing. Kept only as the floor (here, plain substring). |
| Postgres FTS + synonym list    | Solves only the synonyms someone predicted, and a list is maintained forever. |
| User-entered aliases           | Works perfectly, but pushes the work onto capture, which is exactly where this app must stay one step.     |
| Server-side embedding API      | Needs an API key, costs per query, and breaks offline. The spike made it unnecessary. |
| One combined embedded string   | The spike showed appended text helps some queries and breaks others; the max of two representations avoids choosing. |

## Consequences

- **A ~28.5 MB first-use download** (23 MB weights + ~5.5 MB compressed wasm) is a real cost and a reviewer should ask about
  it. It is accepted because the fallback covers the gap: search works from the
  first keystroke and gets better when the model arrives. Measured on a
  production build (unthrottled headless Chromium, real hosts): substring
  results in ~22 ms regardless of network; model ready ~9 s after first use on
  an unthrottled connection and ~139 s on Fast 3G; a re-query ~5 ms. On Slow 3G
  the model is still downloading when the person has long since found their
  item.
- **E2E does not depend on third-party hosts.** `e2e/fixtures.ts` blocks the
  model hosts by default (existing specs stay hermetic) and, for the semantic
  spec, serves the real files from a read-through disk cache
  (`e2e/.model-cache`, restored by `actions/cache` in CI). The first run on a
  cache miss downloads; if the hosts are unreachable that spec skips itself
  rather than failing unrelated work.
- **Rejected for e2e:** pointing `env.localModelPath` at files under `public/`
  (puts 23 MB under the app's own origin and bypasses the real remote path) and a
  real download on every CI run.
- **Open:** the wireframes (v2) have no loading or failed indicator, and none is
  built. The "≈ matched on meaning" badge is built as of 2026-11-10 (below).

## Revised 2026-11-10

A fresh-eyes review of PR #70 (Notion: "Find — transformers.js embedding
search" → Notes → "DECIDED 2026-11-10") changed six things. Each one, and why:

1. **When the model loads: idle prefetch, not first focus.** Lazy-on-focus
   meant the first search nearly always landed on the fallback: model ready
   ~9.4 s after focus on a fast line and ~139 s on Fast 3G, while the person
   types for ~2 s. Now, once the Stuff screen is idle (`requestIdleCallback`,
   `setTimeout` on Safari) and the household has items, the model starts if
   that is free or cheap. *Free* means the pinned weights are already in
   `transformers-cache` (CPU only). *Cheap* means `navigator.connection`
   reports `4g` without Save-Data. Otherwise (no Network Information API, as on
   iPhone Safari and Firefox, or `3g`) it still waits for focus or a keystroke.
   Save-Data / `2g` / `slow-2g` stay skipped even on focus, and even when cached
   (`shouldPrefetch` in `connection.ts`). After the model loads,
   `navigator.storage.persist()` is requested once, so the weights are less
   likely to be evicted. A background download is silent; the loading note
   speaks only during a search.
2. **Ranking: fused, tiered, typo-tolerant.** Pinning every substring hit
   crowded better matches out and bypassed the cap (eight "Box …" hits meant
   eight rows). The lexical side (`lexical.ts`) is now a ranking with tiers:
   exact name > name prefix > word start > name substring > detail >
   typo-tolerant. Typos use Damerau-Levenshtein, ≤1 from 4 characters and ≤2
   from 8. It is fused with the semantic ranking by **reciprocal rank fusion**
   (k = 60), which is rank-based with no threshold. Lexical ties share a rank,
   so the model orders hits of the same tier. The shortlist of 5 caps the
   fused list, with no exemptions. The 3-character minimum and the 150 ms
   debounce are unchanged.
3. **The floor is fuzzy.** Plain substring couldn't forgive "pasport". The
   lexical ranking above is also the whole of Find while the model is loading,
   skipped or failed (uncapped there, since every row has a visible reason).
4. **Honest results.** A ranked list with no threshold looked equally
   confident about nonsense.
   - Rows found by meaning alone carry "≈ matched on meaning" (text-marker,
     muted; no tape and no signal).
   - **CLOSEST** shows only when row 1 matched lexically, or when both
     representations (bare name *and* enriched string) rank it first. That is
     an agreement signal, not a score.
   - With the model loading, or its answer not yet in, and nothing lexical,
     the empty state is "Still looking" and not "No matches", which would be
     untrue a moment later.
5. **Vectors are memoised in memory.** Re-embedding on every remount was
   wasted work. The page-lifetime `EmbeddingClient` keeps a Map keyed by
   `model@revision + text` (LRU, 2,000 entries, ~3 MB at most) and sends only
   misses to the worker. An edit costs only the changed strings, and a remount
   or a delete costs nothing. Still nothing persisted; a reload starts empty.
6. **Pinned and self-hosted.** The model followed upstream `main`, and the wasm
   came from jsDelivr.
   - `MODEL_REVISION` is a commit SHA, passed as `revision` *and* written into
     `env.remotePathTemplate`. transformers.js 4.3.2 builds some Hub URLs
     without the revision (`pipeline()`'s file discovery, and AutoTokenizer's
     `tokenizer_config.json` probe), and those used to hit `resolve/main` on
     every load, even fully cached.
   - The onnxruntime wasm (asyncify and plain builds) is copied into
     `public/ort/<version>/` by `scripts/copy-ort.mjs` (predev + prebuild). The
     worker points `wasmPaths` there, replicating the library's Safari < 26
     choice. The version is in the path because transformers.js caches the
     wasm by URL.
   - `public/ort/` is kept out of Serwist's precache, which globs `public/**`.
   - One failed load gets one retry on the next search intent; a second
     failure is final for the page.

**What self-hosting does not fix: offline.** transformers.js already caches
the wasm (`useWasmCache`) in `transformers-cache`, so jsDelivr was never needed
offline after the first load. With the probes pinned (point 6), a cached
model now starts with no Hugging Face request. The remaining offline
dependency is the **worker entry script**, which deliberately bypasses the
service worker (the fragment problem above) and so relies on the HTTP cache.
The point of self-hosting is one fewer third party and a runtime version
locked to the lockfile.

**Considered and kept.**

- *The model:* v1 is English-only, and all-MiniLM-L6-v2 measured 19/20.
- *Vectors in IndexedDB:* rejected. The model has to start anyway to embed
  queries, and re-embedding 50 items is well under a second.
- *WebGPU:* overkill for a 6 ms-per-embedding encoder.
- *Self-hosting the weights:* on the Vercel task.
