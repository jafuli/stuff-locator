import { NavClearance, SiteNav } from "@/components/site-nav";

// The signed-in app's frame: every route in this group gets the floating
// nav (Stuff / Activity tabs and the household button) and the clearance
// that keeps it from covering the last row. Routes outside the group (the
// marketing home, auth pages, the invite landing, the root 404) don't
// render it at all. ADR 0013 records why this is a layout and not a
// pathname check or a CSS rule.
//
// SiteNav is position: fixed, so it can sit inside the root layout's scroll
// container without scrolling with the page.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <NavClearance />
      <SiteNav />
    </>
  );
}
