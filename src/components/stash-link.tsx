import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

/**
 * The Stash entry point beside the search field, on the Stuff screen and at
 * the top of Browse: a link (it navigates) wearing the system's primary
 * button look, ink fill and paper text. One component, so the two headers
 * can't drift apart.
 */
export function StashLink() {
  return (
    <Link href="/items/new" className={buttonClassName("primary", "shrink-0")}>
      Stash
    </Link>
  );
}
