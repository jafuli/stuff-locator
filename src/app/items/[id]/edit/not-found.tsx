import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClassName } from "@/components/ui/button";

// Next's not-found.tsx convention: rendered when notFound() is called
// within this segment (see page.tsx). Scoped separately from the parent
// item-detail route's own not-found.tsx so this segment is fully
// self-contained, matching the convention every other route boundary file
// in this app already follows.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Item not found"
        titleAs="h1"
        description="It may have been moved or removed."
        action={
          // A real navigation, so a <Link>, not Button's <button> — styled
          // to match Button's secondary variant (see src/components/ui/button.tsx).
          <Link href="/" className={buttonClassName("secondary")}>
            Back to Stuff
          </Link>
        }
      />
    </main>
  );
}
