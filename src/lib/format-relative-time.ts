const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Formats a past date as a compact relative label — "2d", "3w", "4m", "1y" —
 * matching the wireframes' item-row meta badge. Thresholds beyond the
 * wireframe's two literal examples ("2d", "3w") are reasonable defaults,
 * not wireframe-specified.
 */
export function formatRelativeShort(date: Date, now: Date = new Date()): string {
  const elapsedMs = Math.max(0, now.getTime() - date.getTime());

  if (elapsedMs < HOUR_MS) {
    return `${String(Math.max(1, Math.floor(elapsedMs / MINUTE_MS)))}m`;
  }
  if (elapsedMs < DAY_MS) {
    return `${String(Math.floor(elapsedMs / HOUR_MS))}h`;
  }
  if (elapsedMs < WEEK_MS) {
    return `${String(Math.floor(elapsedMs / DAY_MS))}d`;
  }
  if (elapsedMs < MONTH_MS) {
    return `${String(Math.floor(elapsedMs / WEEK_MS))}w`;
  }
  if (elapsedMs < YEAR_MS) {
    return `${String(Math.floor(elapsedMs / MONTH_MS))}m`;
  }
  return `${String(Math.floor(elapsedMs / YEAR_MS))}y`;
}

/**
 * Formats a past date as a full relative phrase — "2 days ago", "3 weeks
 * ago", "1 year ago" — for the activity feed, where formatRelativeShort's
 * compact badge form ("2d", "3w") reads too tersely alongside a sentence.
 * Shares the same thresholds/units as formatRelativeShort rather than
 * duplicating them.
 */
export function formatRelativeLong(date: Date, now: Date = new Date()): string {
  const elapsedMs = Math.max(0, now.getTime() - date.getTime());

  const unit = ((): { amount: number; label: string } => {
    if (elapsedMs < MINUTE_MS) {
      return { amount: 0, label: "minute" };
    }
    if (elapsedMs < HOUR_MS) {
      return { amount: Math.floor(elapsedMs / MINUTE_MS), label: "minute" };
    }
    if (elapsedMs < DAY_MS) {
      return { amount: Math.floor(elapsedMs / HOUR_MS), label: "hour" };
    }
    if (elapsedMs < WEEK_MS) {
      return { amount: Math.floor(elapsedMs / DAY_MS), label: "day" };
    }
    if (elapsedMs < MONTH_MS) {
      return { amount: Math.floor(elapsedMs / WEEK_MS), label: "week" };
    }
    if (elapsedMs < YEAR_MS) {
      return { amount: Math.floor(elapsedMs / MONTH_MS), label: "month" };
    }
    return { amount: Math.floor(elapsedMs / YEAR_MS), label: "year" };
  })();

  if (unit.amount === 0) {
    return "just now";
  }
  return `${String(unit.amount)} ${unit.label}${unit.amount === 1 ? "" : "s"} ago`;
}
