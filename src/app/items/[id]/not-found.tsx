import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

// Next's not-found.tsx convention: rendered when notFound() is called
// within this segment (see page.tsx). Real, deliberate UI — not the
// framework's raw 404 — for the "no item matches this id" case.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Item not found"
        description="It may have been moved or removed."
        action={
          // A real navigation, so a <Link>, not Button's <button> — styled
          // to match Button's secondary variant (see src/components/ui/button.tsx).
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
