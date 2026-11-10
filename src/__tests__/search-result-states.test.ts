import { describe, expect, test } from "vitest";
import type { EmbeddingStatus } from "@/lib/search/embedding-client";
import type { FusedResult } from "@/lib/search/rank";
import { emptyStateFor, meaningOnlyIds, showClosest } from "@/lib/search/result-states";

const row = (id: string, lexicalTier: FusedResult["lexicalTier"], semantic = true): FusedResult => ({
  id,
  lexicalTier,
  semantic,
});

describe("showClosest", () => {
  test("a top row that matched by its letters earns it", () => {
    expect(showClosest(row("a", "exact"), null)).toBe(true);
    expect(showClosest(row("a", "fuzzy-detail", false), null)).toBe(true);
  });

  test("a meaning-only top row earns it only when both representations rank it first", () => {
    expect(showClosest(row("a", null), "a")).toBe(true);
    expect(showClosest(row("a", null), null)).toBe(false);
    expect(showClosest(row("a", null), "b")).toBe(false);
  });

  test("no rows, no marker", () => {
    expect(showClosest(undefined, "a")).toBe(false);
  });
});

describe("meaningOnlyIds", () => {
  test("only rows the model found and the letters didn't", () => {
    expect(meaningOnlyIds([row("a", "prefix"), row("b", null), row("c", "detail", false)])).toEqual(new Set(["b"]));
  });
});

describe("emptyStateFor", () => {
  const input = (status: EmbeddingStatus, overrides: Partial<Parameters<typeof emptyStateFor>[0]> = {}) => ({
    resultCount: 0,
    status,
    query: "travel documents",
    hasSemanticAnswer: false,
    ...overrides,
  });

  test("no empty state when there are rows or no search", () => {
    expect(emptyStateFor(input("loading", { resultCount: 2 }))).toBe("none");
    expect(emptyStateFor(input("failed", { query: "  " }))).toBe("none");
  });

  test("still looking while the model loads", () => {
    expect(emptyStateFor(input("loading"))).toBe("still-looking");
  });

  test("still looking while a ready model's answer is on its way", () => {
    expect(emptyStateFor(input("ready"))).toBe("still-looking");
  });

  test.each(["idle", "skipped", "failed"] as const)("No matches when the model is %s", (status) => {
    expect(emptyStateFor(input(status))).toBe("no-matches");
  });

  test("No matches for a query too short for the model, whatever its state", () => {
    expect(emptyStateFor(input("loading", { query: "zq" }))).toBe("no-matches");
    expect(emptyStateFor(input("ready", { query: "zq" }))).toBe("no-matches");
  });

  test("No matches if the model answered and still nothing is left", () => {
    expect(emptyStateFor(input("ready", { hasSemanticAnswer: true }))).toBe("no-matches");
  });
});
