import type { ReactNode } from "react";
import Link from "next/link";
import { textLinkClassName } from "@/components/ui/text-link";

/**
 * The column every page outside the signed-in app uses: the marketing home
 * and the four auth pages. Shared so the wordmark sits in exactly the same
 * spot on all of them, and moving between them doesn't shift it.
 */
export const STANDALONE_PAGE_CLASSES = "mx-auto flex w-full max-w-xl flex-col gap-8 px-gutter pt-6 pb-10";

export interface SiteHeaderProps {
  /**
   * Makes the wordmark a link to "/" (the marketing home when signed out).
   * Off on "/" itself, which would only link to the page you're on.
   */
  homeLink?: boolean;
  /** Right-hand slot: the marketing home's Sign in link. */
  action?: ReactNode;
}

/**
 * The wordmark row at the top of a standalone page. The wordmark is the
 * logo-tape *type style* on ink, not the bg-tape fill: label tape stays
 * reserved for the last segment of a location.
 */
export function SiteHeader({ homeLink = false, action }: SiteHeaderProps) {
  const wordmark = <span className="inline-block bg-ink px-2 py-1 text-logo-tape text-paper">Stuff Locator</span>;

  return (
    // min-h-target-min keeps the row as tall as a header with a link in it,
    // so the heading below starts at the same height on every page.
    <header className="flex min-h-target-min items-center justify-between gap-3">
      {homeLink ? (
        <Link href="/" className={textLinkClassName({ underline: false })}>
          {wordmark}
        </Link>
      ) : (
        wordmark
      )}
      {action}
    </header>
  );
}
