import Link from "next/link";

export interface BackLinkProps {
  href: string;
  /** What it goes back to — rendered as "‹ Back to {label}". */
  label: string;
}

/**
 * The "‹ Back to …" link at the top of a drill-down page. A real link, so it
 * is keyboard-operable as well as the browser's back button. `meta` type in
 * `muted`, with a 44px-tall target (the glyph is part of the accessible name,
 * which existing tests and users rely on).
 */
export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-target-min w-fit items-center rounded-tape text-meta text-muted outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      ‹ Back to {label}
    </Link>
  );
}
