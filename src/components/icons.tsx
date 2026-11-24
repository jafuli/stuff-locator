import type { SVGProps } from "react";

/**
 * The design system's icon rules, in one place: Lucide-style line icons,
 * 1.5px stroke, round caps and joins, `currentColor`, drawn at 18px (the
 * 17–20px range). Decorative — the visible label next to each one names it —
 * so they are aria-hidden. No emoji, no filled icons.
 */
function LineIcon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Lucide "box" — the Stuff tab. */
export function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </LineIcon>
  );
}

/** Lucide "clock" — the Activity tab. */
export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </LineIcon>
  );
}

/** Lucide "search" — the Stuff search field. */
export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </LineIcon>
  );
}

/** Lucide "chevron-right" — marks a row that navigates somewhere. */
export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </LineIcon>
  );
}

/** Lucide "arrow-right" — between a "from" path and a "to" path. */
export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </LineIcon>
  );
}

/** Lucide "ellipsis" — the ⋯ on a place's menu button. */
export function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </LineIcon>
  );
}

/** Lucide "trash-2" — delete an item, on the item's own page. */
export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </LineIcon>
  );
}

/** Lucide "pencil" — edit your name in the household sheet. */
export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </LineIcon>
  );
}

/** Lucide "check" — save an inline edit. */
export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </LineIcon>
  );
}

/** Lucide "x" — cancel an inline edit. */
export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <LineIcon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </LineIcon>
  );
}
