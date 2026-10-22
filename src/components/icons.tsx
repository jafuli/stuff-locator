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
