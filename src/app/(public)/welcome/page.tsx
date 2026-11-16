import type { Metadata } from "next";
import { MarketingHome } from "@/components/marketing-home";

const DESCRIPTION =
  "A shared list of the 20–50 hard-to-find things you and your partner keep at home, and exactly where each one is.";

// For a shared link to "/": a signed-out visitor (or a link-preview
// crawler) asking for "/" is rewritten here by src/proxy.ts, so this is the
// metadata they get. No `title`, so the root layout's "Stuff Locator" stays.
export const metadata: Metadata = {
  description: DESCRIPTION,
  openGraph: {
    title: "Stuff Locator",
    description: DESCRIPTION,
    siteName: "Stuff Locator",
    type: "website",
  },
};

// Only ever reached through the proxy's rewrite of a signed-out "/". A
// direct request for /welcome is redirected to "/" first, so the marketing
// home has one URL (see resolveRoute in src/lib/route-access.ts).
export default function WelcomePage() {
  return <MarketingHome />;
}
