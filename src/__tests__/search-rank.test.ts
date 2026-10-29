import { describe, expect, test } from "vitest";
import { cosine, enrichedText, mergeLexicalFirst, rankItems, scoreItem, type ItemVectors } from "@/lib/search/rank";

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

describe("mergeLexicalFirst", () => {
  const all = ["a", "b", "c", "d"];

  test("pins substring hits first, then the rest in semantic order", () => {
    expect(mergeLexicalFirst(all, ["c"], ["a", "b", "c", "d"])).toEqual(["c", "a", "b", "d"]);
  });

  test("orders several lexical hits by their semantic rank", () => {
    expect(mergeLexicalFirst(all, ["d", "b"], ["b", "a", "c", "d"])).toEqual(["b", "d", "a", "c"]);
  });

  test("with no semantic order it is just lexical hits, then the remaining items in input order", () => {
    expect(mergeLexicalFirst(all, ["c"], [])).toEqual(["c", "a", "b", "d"]);
  });

  test("with no lexical hits it is the semantic order", () => {
    expect(mergeLexicalFirst(all, [], ["d", "c", "b", "a"])).toEqual(["d", "c", "b", "a"]);
  });

  test("lists every item exactly once", () => {
    const merged = mergeLexicalFirst(all, ["b", "b"], ["b", "a"]);
    expect([...merged].sort()).toEqual(all);
  });

  test("drops ids that are no longer in the list, so a stale ranking can't resurrect a deleted item", () => {
    expect(mergeLexicalFirst(["a", "b"], ["gone"], ["gone", "b", "a"])).toEqual(["b", "a"]);
  });

  test("an item the semantic order doesn't know about yet is still shown", () => {
    expect(mergeLexicalFirst(["new", "a"], [], ["a"])).toEqual(["a", "new"]);
  });
});
