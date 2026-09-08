#!/usr/bin/env node
// Runs as `predev`/`prestart` (package.json) — kills whatever's already
// listening on the port `next dev`/`next start` is about to bind, before
// they start.
//
// Why this exists: `next start` doesn't fail loudly when a stale server is
// already on the port — it either fails to bind or, worse, you keep hitting
// the *old* process and never notice. That cost a full afternoon of "the
// search filter must be broken" / "the not-found link is missing" debugging
// that turned out to be a two-day-old build still squatting on :3000. See
// the PR #8 and #10 review threads for the play-by-play.
//
// Deliberately narrow: only touches the exact port about to be used, does
// nothing if it's already free, and does nothing at all on CI (Playwright's
// own webServer lifecycle in playwright.config.ts owns that there, against
// a clean container with nothing stale to clear).
import { execSync } from "node:child_process";

const port = process.env.PORT ?? "3000";

if (process.env.CI) {
  process.exit(0);
}

try {
  const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);

  if (pids.length === 0) {
    process.exit(0);
  }

  for (const pid of pids) {
    execSync(`kill -9 ${pid}`);
  }
  console.log(`[free-port] Killed stale process(es) on port ${port}: ${pids.join(", ")}`);
} catch {
  // `lsof` exits non-zero when nothing matches the filter — the common
  // case, not an error. Anything else (e.g. `lsof` not installed) is
  // silently skipped too: this is a convenience, not something that should
  // ever block dev/build from starting.
  process.exit(0);
}
