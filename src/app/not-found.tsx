import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

// Next's root not-found.tsx convention: automatically rendered for any
// unmatched path under the app, no notFound() call needed — distinct from
// items/[id]/not-found.tsx and browse/[id]/not-found.tsx, which only fire
// for a bad :id within their own segment. Without this, an unmatched URL
// (a typo'd or stale link) fell through to Next's default, unstyled
// framework 404 instead of the app's own design system.
//
// EmptyState is a reusable leaf whose title renders as a <p> by design (see
// its own doc comment) — it doesn't know its caller's document outline. Root
// layout.tsx renders only SiteNav (a <nav>, not a heading) above this page,
// so nothing else in the tree supplies a heading. Rather than depend on
// EmptyState's titleAs prop (added by a separate, independently-queued
// task, which may or may not have landed on main yet), this page supplies
// its own heading directly — visually hidden since EmptyState's visible
// title already reads correctly on its own, this just gives the page a
// real heading in its accessibility tree.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        title="Page not found"
        description="That link doesn't go anywhere. It may be a typo or an old bookmark."
        action={
          // A real navigation, so a <Link>, not Button's <button> — styled
          // to match Button's secondary variant, same as the other
          // not-found routes.
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-[8px] border-[1.5px] border-line bg-transparent px-[10px] py-[10px] text-[13px] [font-weight:640] text-mid outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Back to Stuff
          </Link>
        }
      />
    </main>
  );
}
