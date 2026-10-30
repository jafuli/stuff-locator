# 12. Find: embedding search in the browser, with the substring filter as the floor

**Status:** Accepted. Settles the "Search" decision in CLAUDE.md; the reasoning
comes from two Design Journal entries (2026-08-16): _Semantic search with no
server: embeddings in the browser_ and _Spike: can embeddings match two-word
item names?_.

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
  library upgrade can't swap in a larger default). 22.97 MB of weights plus
  ~5.5 MB of onnxruntime wasm. Not a language model: a small deterministic
  encoder with no generation and no prompt.
- **Score = max(similarity to the bare name, similarity to the enriched
  string)**, where the enriched string is `name · location path · detail`. Text
  appended to a bare name is high-variance: the location path rescues "tools for
  flat pack furniture" (Allen keys live in a Toolbox) and breaks "something to
  sit on at the park" (the picnic blanket lives in a cupboard). Taking the
  better of two representations lets each query match whichever suits it. The
  spike measured 19/20 correct within the top 3 on queries sharing no words with
  their targets.
- **Ranked shortlist, never a single answer, and no score threshold.** In the
  spike a correct answer scored 0.199 where a wrong one scored 0.467, so no
  cut-off separates them. The list is cut by **rank** (the best five, plus every
  substring hit), never by score, and the first row carries CLOSEST. No score is
  ever shown.
- **Substring hits are pinned first**, then the rest in semantic order. A
  fragment like "pas" embeds to noise, so queries under three characters never
  reach the model, and a real substring hit is never buried by a fuzzy
  neighbour.
- **Vectors are ephemeral.** At ~6 ms per embedding the whole household
  re-embeds in well under a second, so there is no embedding column, no vector
  store, no cache invalidation and no stale vector when an item is renamed. The
  database stores text; the browser derives meaning at runtime.
- **Lazy and connection-aware.** Nothing is downloaded on page load. The model
  starts on first focus of (or keystroke in) the search box. `navigator.connection`
  is feature-detected (Safari and Firefox don't have it): Save-Data, `2g` and
  `slow-2g` skip the download for the session. `3g` is deliberately allowed.
- **Degrade, never block.** The case-insensitive substring filter serves results
  while the model loads, when it is skipped, and permanently if it fails. The UI
  never waits on the model. While it loads, a quiet note goes to assistive tech
  only; a skipped or failed model is silent, because falling back is the design.
- **Empty state.** With the model ready the list is never empty, so "No matches"
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
  The hosts are `huggingface.co` / `*.hf.co` for the model and
  `cdn.jsdelivr.net/npm/onnxruntime-web@…` for the wasm runtime, which is where
  transformers.js loads it from by default; `src/lib/search/model-hosts.ts` is
  the single list.
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

- **A 28 MB first-use download** is a real cost and a reviewer should ask about
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
- **Open:** the wireframes (v2) have no loading or failed indicator and show a
  "≈ matched on meaning" badge on non-lexical hits; neither is built (the badge
  needs an `ItemCard` prop and design-system sign-off).
