import { PUBLIC_PATHS } from "@/lib/route-access";

/** Where a sign-in lands when there's no usable return-to path. */
export const DEFAULT_REDIRECT_PATH = "/";

/**
 * Validates the `?next=` return-to path the proxy attaches when it bounces
 * a signed-out visitor to /sign-in, before anything navigates to it.
 *
 * The param is attacker-controllable — it's just a query string on a
 * public page — so an unchecked `router.push(next)` is an open redirect:
 * a link to /sign-in?next=https://evil.example sends the user somewhere
 * else entirely, wearing this app's sign-in page as the referrer. Only
 * same-origin absolute paths survive; everything else falls back to "/".
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    return DEFAULT_REDIRECT_PATH;
  }

  // Must be an absolute path on this origin. This rejects "https://evil…"
  // and bare "evil.example" alike.
  if (!value.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  // "//evil.example" is a protocol-relative URL, and browsers normalise
  // the backslash form to it — both start with "/" but point off-origin.
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_REDIRECT_PATH;
  }

  // Control characters and whitespace get stripped or rewritten by
  // browsers during URL parsing, which can smuggle a different target
  // past the two checks above (e.g. "/\n/evil.example").
  if (/[\s\u0000-\u001f\u007f]/.test(value)) {
    return DEFAULT_REDIRECT_PATH;
  }

  // Returning someone to the page that sent them here is a loop, not a
  // return — /sign-in?next=/sign-in would bounce forever.
  const [pathname = ""] = value.split(/[?#]/);
  const normalised = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if ((PUBLIC_PATHS as readonly string[]).includes(normalised)) {
    return DEFAULT_REDIRECT_PATH;
  }

  return value;
}

/**
 * Builds a link to an auth route that carries the current return-to path
 * along with it, so bouncing between /sign-in and /sign-up doesn't lose
 * where the visitor was originally headed. Omits the param entirely for
 * the default path — ?next=/ is noise.
 */
export function withNextParam(path: string, next: string): string {
  return next === DEFAULT_REDIRECT_PATH ? path : `${path}?next=${encodeURIComponent(next)}`;
}
