import type { Metadata } from "next";
import { connection } from "next/server";
import { MarketingHome } from "@/components/marketing-home";

const DESCRIPTION =
  "A shared list of the 20–50 hard-to-find things you and your partner keep at home, and exactly where each one is.";

// The site root (MARKETING_PATH). A signed-out visitor or a link-preview
// crawler gets this page and this metadata; a signed-in visitor is
// redirected to the Stuff screen by src/proxy.ts before it renders. No
// `title`, so the root layout's "Stuff Locator" stays.
export const metadata: Metadata = {
  description: DESCRIPTION,
  openGraph: {
    title: "Stuff Locator",
    description: DESCRIPTION,
    siteName: "Stuff Locator",
    type: "website",
  },
};

// Rendered per request, never prerendered, for two reasons:
// - What "/" answers still depends on the session cookie: this page signed
//   out, a redirect to /stuff signed in. A static "/" would come back as a
//   long-lived payload (s-maxage of a year) that a cache could serve to the
//   wrong visitor.
// - The sample rows' "3 days ago" is measured from the render time; static,
//   it would freeze at build time.
export default async function MarketingPage() {
  await connection();
  return <MarketingHome />;
}
