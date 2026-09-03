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
