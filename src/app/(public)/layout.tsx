import { STANDALONE_PAGE_CLASSES } from "@/components/site-header";

// The frame for pages outside the signed-in app: the marketing home (served
// at "/" to signed-out visitors via the proxy's rewrite to /welcome), the
// four auth pages and the invite landing. One centred column and no
// floating nav. Each page renders its own SiteHeader, because the header's
// right-hand side differs (the marketing home has a Sign in link and no
// home link). See ADR 0013.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className={STANDALONE_PAGE_CLASSES}>{children}</div>;
}
