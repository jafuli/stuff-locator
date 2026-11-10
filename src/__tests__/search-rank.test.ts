import { describe, expect, test } from "vitest";
import type { LexicalMatch } from "@/lib/search/lexical";
import {
  cosine,
  enrichedText,
  fuseRankings,
  rankItems,
  RRF_K,
  scoreItem,
  semanticRanking,
  type ItemVectors,
} from "@/lib/search/rank";

const v = (...values: number[]) => Float32Array.from(values);

describe("cosine", () => {
  test("is 1 for the same direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine(v(1, 0), v(1, 0))).toBeCloseTo(1);
    expect(cosine(v(1, 0), v(0, 1))).toBeCloseTo(0);
    expect(cosine(v(1, 0), v(-1, 0))).toBeCloseTo(-1);
  });

  test("ignores vector length, so an un-normalised vector ranks the same", () => {
    expect(cosine(v(3, 0), v(5, 0))).toBeCloseTo(1);
  });

  test("a zero vector scores 0, not NaN", () => {
    expect(cosine(v(0, 0), v(1, 0))).toBe(0);
  });
});

describe("scoreItem", () => {
  const query = v(1, 0);

  test("takes the bare-name similarity when it is the better one", () => {
    expect(scoreItem(query, { name: v(1, 0), enriched: v(0, 1) })).toBeCloseTo(1);
  });

  test("takes the enriched similarity when it is the better one", () => {
    expect(scoreItem(query, { name: v(0, 1), enriched: v(1, 0) })).toBeCloseTo(1);
  });

  test("is the max of the two, not their mean", () => {
    const score = scoreItem(query, { name: v(1, 0), enriched: v(0, 1) });
    // A mean would be 0.5; the max keeps the good representation's full score.
    expect(score).toBeGreaterThan(0.99);
  });
});

describe("rankItems", () => {
  const corpus: ItemVectors[] = [
    { id: "far", name: v(0, 1), enriched: v(0, 1) },
    { id: "near", name: v(1, 0.1), enriched: v(0, 1) },
    // Only its enriched string is close: the max-of-two rule must still find it.
    { id: "via-enriched", name: v(0, 1), enriched: v(1, 0) },
  ];

  test("orders best match first, using whichever representation scores higher", () => {
    expect(rankItems(v(1, 0), corpus)).toEqual(["via-enriched", "near", "far"]);
  });

  test("has no score threshold: even an orthogonal item is still listed", () => {
    const ids = rankItems(v(1, 0), corpus);
    expect(ids).toContain("far");
    expect(ids).toHaveLength(corpus.length);
  });

  test("a negative similarity is still ranked, last, not dropped", () => {
    const ids = rankItems(v(1, 0), [{ id: "opposite", name: v(-1, 0), enriched: v(-1, 0) }, ...corpus]);
    expect(ids.at(-1)).toBe("opposite");
  });

  test("ties keep input order, so newer-first input stays newer-first", () => {
    const tied: ItemVectors[] = [
      { id: "newest", name: v(1, 0), enriched: v(1, 0) },
      { id: "older", name: v(1, 0), enriched: v(1, 0) },
      { id: "oldest", name: v(1, 0), enriched: v(1, 0) },
    ];
    expect(rankItems(v(1, 0), tied)).toEqual(["newest", "older", "oldest"]);
  });

  test("a cut-off is by rank, never by score", () => {
    expect(rankItems(v(1, 0), corpus, 2)).toEqual(["via-enriched", "near"]);
    expect(rankItems(v(1, 0), corpus, 0)).toEqual([]);
  });

  test("an empty corpus ranks to an empty list", () => {
    expect(rankItems(v(1, 0), [])).toEqual([]);
  });

  test("does not mutate the corpus order", () => {
    const before = corpus.map((entry) => entry.id);
    rankItems(v(1, 0), corpus);
    expect(corpus.map((entry) => entry.id)).toEqual(before);
  });
});

describe("enrichedText", () => {
  test("joins name, location path and detail with a middle dot", () => {
    expect(enrichedText({ name: "Passport", detail: "with the birth certificates" }, ["Bedroom", "Filing box"])).toBe(
      "Passport · Bedroom Filing box · with the birth certificates",
    );
  });

  test("leaves out the parts that are missing", () => {
    expect(enrichedText({ name: "Camping tent" }, ["Garage"])).toBe("Camping tent · Garage");
    expect(enrichedText({ name: "Spare router", detail: "  " }, [])).toBe("Spare router");
  });
});

describe("semanticRanking", () => {
  const corpus: ItemVectors[] = [
    { id: "a", name: Float32Array.of(1, 0), enriched: Float32Array.of(0, 1) },
    { id: "b", name: Float32Array.of(0.6, 0.8), enriched: Float32Array.of(0.8, 0.6) },
  ];

  test("reports each representation's own favourite next to the combined order", () => {
    const ranking = semanticRanking([1, 0], corpus);
    expect(ranking.order).toEqual(rankItems([1, 0], corpus));
    expect(ranking.nameTop).toBe("a");
    expect(ranking.enrichedTop).toBe("b");
  });

  test("an empty corpus has no favourite", () => {
    expect(semanticRanking([1, 0], [])).toEqual({ order: [], nameTop: null, enrichedTop: null });
  });
});

const lex = (...pairs: [string, LexicalMatch["tier"]][]): LexicalMatch[] => pairs.map(([id, tier]) => ({ id, tier }));

describe("fuseRankings", () => {
  const all = ["a", "b", "c", "d"];

  test("an item both rankings like beats one only the model likes", () => {
    const fused = fuseRankings(all, lex(["c", "prefix"]), ["a", "c", "b", "d"]);
    expect(fused.map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
  });

  test("scores are reciprocal ranks with k = 60: a lexical #1 that the model ranks last still wins", () => {
    // c: 1/61 + 1/64; a: 1/61. Rank-based only, no similarity involved.
    expect(RRF_K).toBe(60);
    const fused = fuseRankings(all, lex(["c", "word-start"]), ["a", "b", "d", "c"]);
    expect(fused[0]?.id).toBe("c");
  });

  test("lexical ties share a rank, so the model orders items of the same tier", () => {
    const fused = fuseRankings(all, lex(["a", "prefix"], ["b", "prefix"], ["c", "detail"]), ["c", "b", "a", "d"]);
    expect(fused.map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });

  test("a better tier still outranks a worse one when the model is indifferent", () => {
    const fused = fuseRankings(all, lex(["d", "exact"], ["a", "detail"]), ["b", "c", "a", "d"]);
    expect(fused.slice(0, 2).map((r) => r.id)).toEqual(["d", "a"]);
  });

  test("is deterministic: equal scores fall back to the order of allIds", () => {
    const once = fuseRankings(all, lex(["b", "prefix"]), ["a", "c", "b", "d"]);
    const twice = fuseRankings(all, lex(["b", "prefix"]), ["a", "c", "b", "d"]);
    expect(once).toEqual(twice);
    // c and a never tie here, but two semantic-only rows at equal rank can't
    // happen either, so test the tie directly: no semantic list at all.
    expect(fuseRankings(all, lex(["d", "prefix"], ["b", "prefix"]), null).map((r) => r.id)).toEqual(["b", "d"]);
  });

  test("the limit cuts by rank", () => {
    expect(fuseRankings(all, [], ["d", "c", "b", "a"], { limit: 2 }).map((r) => r.id)).toEqual(["d", "c"]);
    expect(fuseRankings(all, [], ["d", "c"], { limit: 0 })).toEqual([]);
  });

  test("never drops or duplicates an id the semantic ranking covers", () => {
    const fused = fuseRankings(all, lex(["b", "prefix"], ["b", "detail"]), ["b", "a", "b", "c", "d"]);
    expect(fused.map((r) => r.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  test("ignores ids that are no longer in the corpus (a stale answer can't resurrect a deleted item)", () => {
    const fused = fuseRankings(["a", "b"], lex(["gone", "exact"]), ["gone", "b", "a"]);
    expect(fused.map((r) => r.id)).toEqual(["b", "a"]);
  });

  test("an item the stale ranking doesn't know yet only appears if it matched lexically", () => {
    expect(fuseRankings(["new", "a"], [], ["a"]).map((r) => r.id)).toEqual(["a"]);
    expect(fuseRankings(["new", "a"], lex(["new", "prefix"]), ["a"]).map((r) => r.id)).toEqual(["new", "a"]);
  });

  test("without the model it is the lexical ranking, uncapped", () => {
    const fused = fuseRankings(all, lex(["c", "exact"], ["a", "fuzzy-name"]), null);
    expect(fused).toEqual([
      { id: "c", lexicalTier: "exact", semantic: false },
      { id: "a", lexicalTier: "fuzzy-name", semantic: false },
    ]);
  });

  test("each row says why it matched", () => {
    const fused = fuseRankings(all, lex(["b", "detail"]), ["a", "b"]);
    expect(fused).toEqual([
      { id: "b", lexicalTier: "detail", semantic: true },
      { id: "a", lexicalTier: null, semantic: true },
    ]);
  });
});
