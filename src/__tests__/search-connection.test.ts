import { describe, expect, test } from "vitest";
import { shouldAutoDownload } from "@/lib/search/connection";

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
