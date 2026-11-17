import Link from "next/link";
import { SiteHeader, STANDALONE_PAGE_CLASSES } from "@/components/site-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClassName } from "@/components/ui/button";
import { MARKETING_PATH } from "@/lib/routes";

// Next's root not-found.tsx convention: automatically rendered for any
// unmatched path under the app, no notFound() call needed — distinct from
// items/[id]/not-found.tsx and browse/[id]/not-found.tsx, which only fire
// for a bad :id within their own segment. Without this, an unmatched URL
// (a typo'd or stale link) fell through to Next's default, unstyled
// framework 404 instead of the app's own design system.
//
// EmptyState is a reusable leaf whose title renders as a <p> by design (see
// its own doc comment) — it doesn't know its caller's document outline, and
// nothing else in the tree supplies a heading. Rather than depend on
// EmptyState's titleAs prop (added by a separate, independently-queued
// task, which may or may not have landed on main yet), this page supplies
// its own heading directly — visually hidden since EmptyState's visible
// title already reads correctly on its own, this just gives the page a
// real heading in its accessibility tree.
//
// Route groups (ADR 0013): a root not-found.tsx can't sit inside (app) or
// (public), so it renders as a standalone page, with the wordmark header and
// no floating nav. "Back to Stuff" goes to the site root (MARKETING_PATH):
// anyone can land here, and "/" sends a signed-in visitor on to the Stuff
// screen and shows a signed-out one the marketing home. A bad item or place id
// (items/[id]/not-found.tsx, browse/[id]/not-found.tsx) is inside (app) and
// keeps the nav.
export default function NotFound() {
  return (
    <div className={STANDALONE_PAGE_CLASSES}>
      <SiteHeader homeLink />
      <main className="flex flex-col items-center pt-10">
        <h1 className="sr-only">Page not found</h1>
        <EmptyState
          title="Page not found"
          description="That link doesn't go anywhere. It may be a typo or an old bookmark."
          action={
            // A real navigation, so a <Link>, not Button's <button> — styled
            // to match Button's secondary variant, same as the other
            // not-found routes.
            <Link href={MARKETING_PATH} className={buttonClassName("secondary")}>
              Back to Stuff
            </Link>
          }
        />
      </main>
    </div>
  );
}
