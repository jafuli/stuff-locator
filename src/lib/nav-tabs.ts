import type { NavTab } from "@/components/tab-capsule";
import { STUFF_PATH } from "@/lib/routes";

// The wireframe draws 3 tabs (Stuff / Activity / Home) and its own footer
// calls the tab count an open question. Two it is: the third ("Home" —
// household settings) lives in the household button + sheet instead, so the
// capsule stays a plain two-way switch between the two things you do every
// day. See site-nav.tsx and household-menu.tsx.
//
// Single source of truth: both the real app shell (src/components/site-nav.tsx)
// and the /~components catalog page import this, so they can't drift apart.
export const NAV_TABS: NavTab[] = [
  // Browse is Stuff by place (the All / By place chips), so Stuff stays
  // selected there. Item pages (/items/...) belong to neither tab.
  { href: STUFF_PATH, label: "Stuff", icon: "box", matches: ["/browse"] },
  { href: "/activity", label: "Activity", icon: "clock" },
];
