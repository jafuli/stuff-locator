import { describe, expect, test } from "vitest";
import { shouldAutoDownload, shouldPrefetch } from "@/lib/search/connection";

describe("shouldAutoDownload", () => {
  test("allows the download when the browser has no Network Information API (Safari, Firefox)", () => {
    expect(shouldAutoDownload({})).toBe(true);
    expect(shouldAutoDownload(undefined)).toBe(true);
  });

  test("allows it on an ordinary connection", () => {
    expect(shouldAutoDownload({ connection: { effectiveType: "4g", saveData: false } })).toBe(true);
    expect(shouldAutoDownload({ connection: {} })).toBe(true);
  });

  test("holds back when the person has asked for Save-Data", () => {
    expect(shouldAutoDownload({ connection: { saveData: true, effectiveType: "4g" } })).toBe(false);
  });

  test("holds back on 2g and slow-2g", () => {
    expect(shouldAutoDownload({ connection: { effectiveType: "slow-2g" } })).toBe(false);
    expect(shouldAutoDownload({ connection: { effectiveType: "2g" } })).toBe(false);
  });

  test("does not hold back on 3g, where the substring filter covers the wait", () => {
    expect(shouldAutoDownload({ connection: { effectiveType: "3g" } })).toBe(true);
  });
});

describe("shouldPrefetch", () => {
  test("starts in the background on a 4g connection", () => {
    expect(shouldPrefetch({ connection: { effectiveType: "4g" } }, { cached: false })).toBe(true);
    expect(shouldPrefetch({ connection: { effectiveType: "4g", saveData: false } }, { cached: false })).toBe(true);
  });

  test("starts in the background when the model is already cached, whatever the connection", () => {
    expect(shouldPrefetch({ connection: { effectiveType: "3g" } }, { cached: true })).toBe(true);
    expect(shouldPrefetch({}, { cached: true })).toBe(true);
    expect(shouldPrefetch(undefined, { cached: true })).toBe(true);
  });

  test("waits for focus without the Network Information API (Safari, Firefox)", () => {
    expect(shouldPrefetch({}, { cached: false })).toBe(false);
    expect(shouldPrefetch(undefined, { cached: false })).toBe(false);
    expect(shouldPrefetch({ connection: {} }, { cached: false })).toBe(false);
  });

  test("waits for focus on 3g", () => {
    expect(shouldPrefetch({ connection: { effectiveType: "3g" } }, { cached: false })).toBe(false);
  });

  test("never prefetches on Save-Data, 2g or slow-2g, even with the model cached", () => {
    for (const cached of [false, true]) {
      expect(shouldPrefetch({ connection: { effectiveType: "4g", saveData: true } }, { cached })).toBe(false);
      expect(shouldPrefetch({ connection: { effectiveType: "2g" } }, { cached })).toBe(false);
      expect(shouldPrefetch({ connection: { effectiveType: "slow-2g" } }, { cached })).toBe(false);
    }
  });
});
