import type { NavTab } from "@/components/bottom-nav";

// The wireframe draws 3 tabs (Stuff / Activity / Home) and its own footer
// calls the tab count an open question. This task's scope is exactly Stuff +
// Activity ("Home" — household settings — isn't built yet), so it's dropped
// here — a real divergence from the wireframe's drawing, flagged rather than
// silently decided. See the PR description.
//
// Single source of truth: both the real app shell (src/components/site-nav.tsx)
// and the /~components catalog page import this, so they can't drift apart.
export const NAV_TABS: NavTab[] = [
  { href: "/", label: "Stuff" },
  { href: "/activity", label: "Activity" },
];
