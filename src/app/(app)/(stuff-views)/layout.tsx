import { StuffViewsShell } from "@/components/stuff-views-shell";

// The Stuff screen (/stuff) and the top of Browse (/browse) are one screen
// with an All / By place toggle. This route group gives them one layout, so
// the header they share (heading, search, Stash, chips) is rendered once and
// stays mounted when you switch: only the page under it changes. Place pages
// (/browse/[id]) are deliberately outside the group — they have their own
// Back link and ⋯ header, and no chips.
//
// No data reads here, so the header renders at once; each page tells the
// header its count and mode when its own data arrives (RegisterStuffView).
export default function StuffViewsLayout({ children }: LayoutProps<"/">) {
  return <StuffViewsShell>{children}</StuffViewsShell>;
}
