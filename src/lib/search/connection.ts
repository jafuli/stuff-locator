// `navigator.connection` (Network Information API) is Chromium-only: Safari and
// Firefox don't have it, and TypeScript's DOM lib doesn't type it. Everything
// here treats it as optional, and a missing API means "no reason to hold back".

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export interface ConnectionSource {
  connection?: NetworkInformationLike;
}

// 2g and slow-2g only. 3g is deliberately allowed: ~23 MB over 3g is slow but
// bounded, the substring filter covers the wait, and Chromium reports "3g" for
// a lot of ordinary mobile connections, so blocking it would skip the model
// for many people who'd be fine. Save-Data is the explicit "don't" signal.
const SLOW_CONNECTION_TYPES: ReadonlySet<string> = new Set(["slow-2g", "2g"]);

/**
 * Whether it's acceptable to start a ~23 MB download without being asked.
 * False means Find stays on the substring filter for the session.
 */
export function shouldAutoDownload(source: ConnectionSource | undefined): boolean {
  const connection = source?.connection;
  if (!connection) {
    return true;
  }
  if (connection.saveData === true) {
    return false;
  }
  return !(connection.effectiveType !== undefined && SLOW_CONNECTION_TYPES.has(connection.effectiveType));
}

/**
 * Whether to start the model in the background, before anyone touches the
 * search box. Stricter than shouldAutoDownload: a download nobody asked for
 * has to be either free or clearly cheap.
 *
 * 1. Save-Data / 2g / slow-2g: never, not even with the model cached. Those
 *    stay "skipped" on focus too, and a background start must not undo that.
 * 2. Model already in the cache: yes. Starting costs CPU, not data.
 * 3. A connection that reports "4g" (and no Save-Data): yes.
 * 4. Anything else, including a browser with no Network Information API
 *    (Safari, Firefox) or a 3g connection: no. Those wait for focus or a
 *    keystroke, which still starts the model as before.
 */
export function shouldPrefetch(source: ConnectionSource | undefined, { cached }: { cached: boolean }): boolean {
  if (!shouldAutoDownload(source)) {
    return false;
  }
  if (cached) {
    return true;
  }
  const connection = source?.connection;
  return connection?.effectiveType === "4g" && connection.saveData !== true;
}
