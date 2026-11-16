import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClassName } from "@/components/ui/button";

// Next's not-found.tsx convention: rendered when notFound() is called
// within this segment (see page.tsx). Real, deliberate UI — not the
// framework's raw 404 — for the "no location matches this id" case.
// Distinct copy from items/[id]/not-found.tsx's "Item not found" — this is
// a different kind of missing thing (a location, not an item).
//
// Renders EmptyState as this page's only content, same reasoning as this
// segment's error.tsx: notFound() replaces the route's content rather than
// sitting alongside its success-case <h1>, so titleAs="h1" gives this
// route its own real heading.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Location not found"
        titleAs="h1"
        description="This location doesn't exist — it may have been renamed or removed."
        action={
          // A real navigation, so a <Link>, not Button's <button> — styled
          // to match Button's secondary variant, same as items/[id]/not-found.tsx.
          <Link href="/browse" className={buttonClassName("secondary")}>
            Back to Browse
          </Link>
        }
      />
    </main>
  );
}
