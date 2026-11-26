import { describe, expect, test } from "vitest";
import { clampToLength, countLine, limitStatus, PLACES, THINGS } from "@/lib/limits";

describe("limitStatus — the one 90% / 100% rule every counter uses", () => {
  test.each([
    [0, 100, "normal"],
    [89, 100, "normal"],
    [90, 100, "near"],
    [99, 100, "near"],
    [100, 100, "reached"],
    [101, 100, "reached"],
  ] as const)("%i of %i is %s", (count, max, status) => {
    expect(limitStatus(count, max)).toBe(status);
  });

  test.each([
    // Each text limit's first "near" value: 72 / 80, 450 / 500, 54 / 60, 45 / 50.
    [71, 80, "normal"],
    [72, 80, "near"],
    [449, 500, "normal"],
    [450, 500, "near"],
    [53, 60, "normal"],
    [54, 60, "near"],
    [44, 50, "normal"],
    [45, 50, "near"],
    [50, 50, "reached"],
  ] as const)("%i of %i is %s", (count, max, status) => {
    expect(limitStatus(count, max)).toBe(status);
  });

  test("a limit that isn't a multiple of 10 rounds the threshold up, never down", () => {
    // 90% of 8 is 7.2: 7 is still normal, 8 is the limit itself.
    expect(limitStatus(7, 8)).toBe("normal");
    expect(limitStatus(8, 8)).toBe("reached");
  });
});

describe("countLine", () => {
  test("below 90% it is a plain count, singular for one", () => {
    expect(countLine(37, 100, THINGS)).toBe("37 things");
    expect(countLine(1, 100, THINGS)).toBe("1 thing");
    expect(countLine(14, 100, PLACES)).toBe("14 places");
    expect(countLine(1, 100, PLACES)).toBe("1 place");
  });

  test("from 90% it says 'n of max'", () => {
    expect(countLine(90, 100, THINGS)).toBe("90 of 100 things");
    expect(countLine(92, 100, PLACES)).toBe("92 of 100 places");
  });

  test("at the limit it leads with 'Limit reached'", () => {
    expect(countLine(100, 100, THINGS)).toBe("Limit reached: 100 of 100 things");
    expect(countLine(100, 100, PLACES)).toBe("Limit reached: 100 of 100 places");
  });
});

describe("clampToLength", () => {
  test("leaves short text alone", () => {
    expect(clampToLength("jane", 50)).toBe("jane");
  });

  test("cuts to the limit and trims what the cut leaves at the end", () => {
    expect(clampToLength("a".repeat(64), 50)).toBe("a".repeat(50));
    expect(clampToLength(`${"a".repeat(49)} b`, 50)).toBe("a".repeat(49));
  });

  test("counts code points like Postgres' char_length, so an emoji is never split in half", () => {
    const text = "🧳".repeat(51);
    expect(Array.from(clampToLength(text, 50))).toHaveLength(50);
  });
});
