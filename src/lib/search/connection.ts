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
