import { describe, expect, test } from "vitest";
import { damerauLevenshtein, lexicalRank, lexicalTier, normalise, typoBudget } from "@/lib/search/lexical";

const tierOf = (name: string, query: string, detail?: string) => lexicalTier({ name, detail }, normalise(query));

describe("normalise", () => {
  test("lower-cases and collapses whitespace", () => {
    expect(normalise("  Camping\t  TENT \n")).toBe("camping tent");
  });
});

describe("tiers", () => {
  test.each([
    ["Passport", "passport", undefined, "exact"],
    ["Passport", "  PASSPORT ", undefined, "exact"],
    ["Passport", "pass", undefined, "prefix"],
    ["Camping tent", "tent", undefined, "word-start"],
    ["Router box + cables", "cab", undefined, "word-start"],
    ["Passport", "port", undefined, "name-substring"],
    ["Passport", "birth", "with the birth certificates", "detail"],
    ["Passport", "pasport", undefined, "fuzzy-name"],
    ["Camping tent", "campign tnet", undefined, "fuzzy-name"],
    ["Passport", "birht certificates", "with the birth certificates", "fuzzy-detail"],
    ["Passport", "spare keys", undefined, null],
  ] as const)("%s / %s -> %s", (name, query, detail, tier) => {
    expect(tierOf(name, query, detail)).toBe(tier);
  });

  test("whitespace inside the query is normalised too", () => {
    expect(tierOf("Camping tent", "camping    tent")).toBe("exact");
  });
});

describe("typo tolerance", () => {
  test("budget: none under 4 characters, 1 from 4, 2 from 8", () => {
    expect([3, 4, 7, 8, 12].map(typoBudget)).toEqual([0, 1, 1, 2, 2]);
  });

  test("a short word must match exactly ('box' does not reach 'fox')", () => {
    expect(tierOf("Fox ornament", "box")).toBeNull();
  });

  test("one typo is forgiven from 4 characters, a second only from 8", () => {
    expect(tierOf("Tent", "tnet")).toBe("fuzzy-name");
    expect(tierOf("Tent", "tnte")).toBeNull();
    expect(tierOf("Passport", "psaspotr")).toBe("fuzzy-name");
    expect(tierOf("Certificates", "certifcatse")).toBe("fuzzy-name");
  });

  test("a typo while still typing reaches the word ('pasp' -> Passport)", () => {
    expect(tierOf("Passport", "pasp")).toBe("fuzzy-name");
  });

  test("damerauLevenshtein counts a transposition as one edit and stops early", () => {
    expect(damerauLevenshtein("tent", "tnet")).toBe(1);
    expect(damerauLevenshtein("pasport", "passport")).toBe(1);
    expect(damerauLevenshtein("kitten", "sitting")).toBe(3);
    expect(damerauLevenshtein("abc", "abcdefgh", 1)).toBe(2);
    expect(damerauLevenshtein("", "")).toBe(0);
  });
});

describe("lexicalRank", () => {
  const docs = [
    { id: "box", name: "Toolbox", detail: "passport photos" },
    { id: "typo", name: "Pasports (old)" },
    { id: "exact", name: "Passport" },
    { id: "prefix", name: "Passport covers" },
  ];

  test("orders by tier: exact, prefix, then detail, then typo-tolerant", () => {
    expect(lexicalRank(docs, "passport")).toEqual([
      { id: "exact", tier: "exact" },
      { id: "prefix", tier: "prefix" },
      { id: "box", tier: "detail" },
      { id: "typo", tier: "fuzzy-name" },
    ]);
  });

  test("breaks ties by input order", () => {
    const twins = [
      { id: "second", name: "Box B" },
      { id: "first", name: "Box A" },
    ];
    expect(lexicalRank(twins, "box").map((m) => m.id)).toEqual(["second", "first"]);
  });

  test("an empty query matches nothing (showing everything is the caller's case)", () => {
    expect(lexicalRank(docs, "   ")).toEqual([]);
  });
});
