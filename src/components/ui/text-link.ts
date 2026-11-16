import { cn } from "@/lib/cn";

/**
 * An in-flow text link: underlined, 44px tall to tap, the system's focus
 * ring. `muted` is for tertiary links ("Forgot your password?"); the default
 * is ink, for the link that is the next step ("Back to home"). `inline` is
 * for a link in the middle of a sentence ("Already have an account? Sign in").
 * `underline: false` keeps the tap target and focus ring but drops the
 * underline, for a link whose content already says it's a link (the
 * wordmark going home).
 */
export function textLinkClassName(
  options: { muted?: boolean; inline?: boolean; underline?: boolean; className?: string } = {},
): string {
  return cn(
    "rounded-tape",
    options.underline !== false && "underline underline-offset-2",
    // Inside a sentence the link takes the sentence's own size and line; on
    // its own line it is a 44px-tall target.
    options.inline ? "font-medium" : "inline-flex min-h-target-min w-fit items-center text-meta",
    "focus-ring",
    options.muted ? "text-muted" : "text-ink",
    !options.inline && !options.muted && "font-medium",
    options.className,
  );
}
