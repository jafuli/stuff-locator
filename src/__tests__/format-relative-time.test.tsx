import { expect, test } from "vitest";
import { formatRelativeLong } from "@/lib/format-relative-time";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

test("formats sub-minute elapsed time as 'just now'", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  expect(formatRelativeLong(new Date(now.getTime() - 30 * 1000), now)).toBe("just now");
});

test("pluralizes multi-unit durations", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  expect(formatRelativeLong(new Date(now.getTime() - 2 * DAY_MS), now)).toBe("2 days ago");
  expect(formatRelativeLong(new Date(now.getTime() - 3 * WEEK_MS), now)).toBe("3 weeks ago");
});

test("keeps singular phrasing for exactly one unit", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  expect(formatRelativeLong(new Date(now.getTime() - 1 * DAY_MS), now)).toBe("1 day ago");
  expect(formatRelativeLong(new Date(now.getTime() - 1 * YEAR_MS), now)).toBe("1 year ago");
});
