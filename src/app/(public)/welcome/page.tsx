import type { Metadata } from "next";
import { connection } from "next/server";
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
//
// Rendered per request, never prerendered, for two reasons:
// - What "/" returns depends on the session cookie. As a static page, the
//   signed-out prefetch of "/" (every wordmark link) came back as a
//   long-lived static payload (s-maxage of a year), and the client router
//   reused it after sign-in, showing a signed-in user the marketing page.
//   e2e/route-protection.spec.ts ("prefetched while signed out") covers it.
// - The sample rows' "3 days ago" is measured from the render time; static,
//   it would freeze at build time.
export default async function WelcomePage() {
  await connection();
  return <MarketingHome />;
}
